# backend/learn_api.py
"""/api/learn — topic lessons, Capablanca drills, Lichess puzzles, attempts, spaced review."""
from __future__ import annotations

import datetime
from functools import lru_cache
from pathlib import Path
from typing import Literal

import chess
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from corpus_tools.puzzles import get_puzzle, select_puzzles

from .config import CORPUS_DIR, HINT_TIME, PUZZLES_DB
from .db import LearnAttempt, LearnReview, LearnState, get_db
from .game_utils import mover_win_loss
from .identity import current_user
from .learn_content import Corpus, find_drill, load_corpus, topic_detail, topic_summaries
from .learn_progress import START_RATING, next_review, topic_progress, topic_status, update_rating

router = APIRouter(prefix="/api/learn")

ALSO_GOOD_MAX_LOSS = 5.0   # win% points, same scale as move classification
NO_PUZZLE_DB = "Puzzle database not built — run scripts/build_corpus.py puzzles"


# ── Dependencies (overridden in tests) ─────────────────────────────────────────
@lru_cache(maxsize=1)
def _load_default_corpus() -> Corpus:
    return load_corpus(CORPUS_DIR)


def get_corpus() -> Corpus:
    return _load_default_corpus()


def get_puzzles_db() -> Path:
    return PUZZLES_DB


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def _state(db: Session, user: str, key: str, default: float) -> float:
    row = db.get(LearnState, (user, key))
    return row.value if row else default


def _set_state(db: Session, user: str, key: str, value: float) -> None:
    row = db.get(LearnState, (user, key))
    if row:
        row.value = value
    else:
        db.add(LearnState(user=user, key=key, value=value))


# ── Topics ──────────────────────────────────────────────────────────────────────
def _progress(db: Session, corpus: Corpus, t: dict, user: str) -> dict:
    if t["has_puzzles"]:
        rows = (db.query(LearnAttempt.solved)
                .filter(LearnAttempt.user == user, LearnAttempt.topic == t["slug"], LearnAttempt.kind == "puzzle",
                        LearnAttempt.rating_after.isnot(None))
                .order_by(LearnAttempt.id).all())
        return topic_progress([bool(r[0]) for r in rows])
    drills = (topic_detail(corpus, t["slug"]) or {}).get("drills", [])
    latest: dict[str, bool] = {}
    if drills:
        rows = (db.query(LearnAttempt.ref, LearnAttempt.solved)
                .filter(LearnAttempt.user == user, LearnAttempt.kind == "book",
                        LearnAttempt.ref.in_([d["ref"] for d in drills]))
                .order_by(LearnAttempt.id).all())
        latest = {ref: bool(solved) for ref, solved in rows}
    solved = sum(latest.values())
    return {"attempts": len(latest), "solved": solved,
            "accuracy": solved / len(drills) if latest else None}


@router.get("/topics")
def list_topics(db: Session = Depends(get_db), corpus: Corpus = Depends(get_corpus),
                user: str = Depends(current_user)):
    groups: list[dict] = []
    for t in topic_summaries(corpus):
        if not groups or groups[-1]["group"] != t["group"]:
            groups.append({"group": t["group"], "topics": []})
        groups[-1]["topics"].append({**t, "progress": _progress(db, corpus, t, user)})
    due = db.query(LearnReview).filter(LearnReview.user == user, LearnReview.due_at <= _now()).count()
    return {"rating": _state(db, user, "puzzle_rating", START_RATING), "reviews_due": due, "groups": groups}


@router.get("/topics/{slug}")
def get_topic(slug: str, corpus: Corpus = Depends(get_corpus), puzzles_db: Path = Depends(get_puzzles_db)):
    detail = topic_detail(corpus, slug)
    if detail is None:
        raise HTTPException(404, "Unknown topic")
    return {**detail, "puzzles_available": bool(detail["themes"]) and Path(puzzles_db).exists()}


@router.get("/topics/{slug}/puzzles")
def topic_puzzles(slug: str, n: int = 10, db: Session = Depends(get_db),
                  corpus: Corpus = Depends(get_corpus), puzzles_db: Path = Depends(get_puzzles_db),
                  user: str = Depends(current_user)):
    detail = topic_detail(corpus, slug)
    if detail is None:
        raise HTTPException(404, "Unknown topic")
    rating = _state(db, user, "puzzle_rating", START_RATING)
    if not detail["themes"]:
        return {"rating": rating, "puzzles": []}
    if not Path(puzzles_db).exists():
        raise HTTPException(503, NO_PUZZLE_DB)
    seen = {r[0] for r in db.query(LearnAttempt.ref)
            .filter(LearnAttempt.user == user, LearnAttempt.kind == "puzzle").all()}
    puzzles = select_puzzles(puzzles_db, detail["themes"], rating, max(1, min(n, 20)), seen)
    return {"rating": rating, "puzzles": [{k: p[k] for k in ("id", "fen", "moves", "rating", "themes")}
                                           for p in puzzles]}


# ── Status: what you've studied, practised and passed ───────────────────────────
def _iso(t: datetime.datetime | None) -> str | None:
    return t.isoformat() if t else None


@router.post("/topics/{slug}/studied")
def mark_studied(slug: str, db: Session = Depends(get_db), corpus: Corpus = Depends(get_corpus),
                 user: str = Depends(current_user)):
    """The lesson's reading was opened. First time only; returns when."""
    if topic_detail(corpus, slug) is None:
        raise HTTPException(404, "Unknown topic")
    key = f"studied:{slug}"
    if db.get(LearnState, (user, key)) is None:
        _set_state(db, user, key, _now().timestamp())
        db.commit()
    return {"studied_at": _iso(datetime.datetime.fromtimestamp(_state(db, user, key, 0)))}


@router.get("/status")
def learn_status(db: Session = Depends(get_db), corpus: Corpus = Depends(get_corpus),
                 user: str = Depends(current_user)):
    studied = {r.key.removeprefix("studied:"): datetime.datetime.fromtimestamp(r.value)
               for r in db.query(LearnState).filter(LearnState.user == user, LearnState.key.like("studied:%"))}
    attempts = (db.query(LearnAttempt).filter(LearnAttempt.user == user).order_by(LearnAttempt.id).all())
    last: dict[str, datetime.datetime] = {}
    book_latest: dict[str, bool] = {}
    for a in attempts:
        if a.topic:
            last[a.topic] = a.created_at
        if a.kind == "book":
            book_latest[a.ref] = bool(a.solved)
    queued: dict[str, int] = {}
    for (topic,) in db.query(LearnReview.topic).filter(LearnReview.user == user):
        queued[topic] = queued.get(topic, 0) + 1

    groups: list[dict] = []
    counts = {"new": 0, "studied": 0, "practising": 0, "passed": 0}
    for t in topic_summaries(corpus):
        slug = t["slug"]
        refs = [d["ref"] for d in (topic_detail(corpus, slug) or {}).get("drills", [])]
        tried = [book_latest[r] for r in refs if r in book_latest]
        drills = {"total": len(refs), "tried": len(tried), "solved": sum(tried)}
        puzzles = (topic_progress([bool(a.solved) for a in attempts
                                   if a.topic == slug and a.kind == "puzzle" and a.rating_after is not None])
                   if t["has_puzzles"] else {"attempts": 0, "solved": 0, "accuracy": None})
        status = topic_status(studied=slug in studied, has_puzzles=t["has_puzzles"], puzzles=puzzles,
                              drills_total=drills["total"], drills_tried=drills["tried"],
                              drills_solved=drills["solved"])
        counts[status] += 1
        if not groups or groups[-1]["group"] != t["group"]:
            groups.append({"group": t["group"], "topics": []})
        groups[-1]["topics"].append({
            "slug": slug, "title": t["title"], "has_puzzles": t["has_puzzles"], "status": status,
            "studied_at": _iso(studied.get(slug)), "last_activity": _iso(last.get(slug)),
            "puzzles": puzzles, "drills": drills, "reviews_queued": queued.get(slug, 0)})

    rated = [a for a in attempts if a.rating_after is not None]
    return {
        "rating": _state(db, user, "puzzle_rating", START_RATING),
        "rated_attempts": len(rated),
        "rating_history": [{"at": _iso(a.created_at), "rating": round(a.rating_after, 1)} for a in rated[-200:]],
        "reviews_due": db.query(LearnReview).filter(LearnReview.user == user, LearnReview.due_at <= _now()).count(),
        "reviews_queued": sum(queued.values()),
        "counts": counts,
        "groups": groups,
    }


# ── Attempts & review ───────────────────────────────────────────────────────────
class AttemptRequest(BaseModel):
    kind: Literal["puzzle", "book"]
    ref: str = Field(min_length=1)
    topic: str | None = None
    context: Literal["lesson", "review"] = "lesson"
    solved: bool
    revealed: bool = False
    seconds: float | None = None
    puzzle_rating: int | None = None


@router.post("/attempts")
def record_attempt(req: AttemptRequest, db: Session = Depends(get_db), user: str = Depends(current_user)):
    solved = req.solved and not req.revealed          # a shown solution is a miss
    first = db.query(LearnAttempt).filter(LearnAttempt.user == user, LearnAttempt.kind == req.kind,
                                          LearnAttempt.ref == req.ref).first() is None
    rated = req.kind == "puzzle" and req.context == "lesson" and first and req.puzzle_rating is not None
    before = after = None
    if rated:
        before = _state(db, user, "puzzle_rating", START_RATING)
        n_rated = int(_state(db, user, "rated_attempts", 0))
        after = update_rating(before, req.puzzle_rating, solved, n_rated)
        _set_state(db, user, "puzzle_rating", after)
        _set_state(db, user, "rated_attempts", n_rated + 1)
    now = _now()
    db.add(LearnAttempt(user=user, kind=req.kind, ref=req.ref, topic=req.topic, context=req.context, solved=int(solved),
                        revealed=int(req.revealed), seconds=req.seconds, puzzle_rating=req.puzzle_rating,
                        rating_before=before, rating_after=after, created_at=now))
    item = db.query(LearnReview).filter(LearnReview.user == user, LearnReview.kind == req.kind,
                                        LearnReview.ref == req.ref).first()
    if item and solved and req.context == "lesson":
        # Re-solving a queued position outside a review (e.g. "restart" right after a miss)
        # mustn't advance it — only spaced review does that.
        db.commit()
        return {"rated": rated, "rating_before": before, "rating_after": after,
                "review": {"step": item.step, "due_at": item.due_at.isoformat()}}
    nxt = next_review(item.step if item else None, solved, now)
    review = None
    if nxt is None:
        if item:
            db.delete(item)
    else:
        step, due = nxt
        if item:
            item.step, item.due_at, item.updated_at = step, due, now
            item.topic = req.topic or item.topic
        else:
            db.add(LearnReview(user=user, kind=req.kind, ref=req.ref, topic=req.topic, step=step, due_at=due, updated_at=now))
        review = {"step": step, "due_at": due.isoformat()}
    db.commit()
    return {"rated": rated, "rating_before": before, "rating_after": after, "review": review}


@router.get("/reviews")
def due_reviews(db: Session = Depends(get_db), corpus: Corpus = Depends(get_corpus),
                puzzles_db: Path = Depends(get_puzzles_db), user: str = Depends(current_user)):
    have_db = Path(puzzles_db).exists()
    items = []
    for r in (db.query(LearnReview).filter(LearnReview.user == user, LearnReview.due_at <= _now())
              .order_by(LearnReview.due_at).all()):
        if r.kind == "puzzle":
            p = get_puzzle(puzzles_db, r.ref) if have_db else None
            position = p and {k: p[k] for k in ("id", "fen", "moves", "rating", "themes")}
        else:
            position = find_drill(corpus, r.ref)
        if position:
            items.append({"kind": r.kind, "ref": r.ref, "topic": r.topic, "step": r.step,
                          "due_at": r.due_at.isoformat(), "position": position})
    return {"items": items}


# ── Judging a different move in a book drill ────────────────────────────────────
class JudgeRequest(BaseModel):
    fen: str
    move: str
    expected: str


def _eval_after(board: chess.Board, move: chess.Move) -> float:
    from .engine import terminal_eval
    from .main import run_hint_engine            # lazy: main imports this module
    b = board.copy()
    b.push(move)
    if b.is_game_over():
        return terminal_eval(b)
    fen = b.fen()
    return run_hint_engine(lambda eng: eng.evaluate(fen, time_limit=HINT_TIME))


@router.post("/judge")
def judge(req: JudgeRequest):
    try:
        board = chess.Board(req.fen)
        played = chess.Move.from_uci(req.move)
        expected = chess.Move.from_uci(req.expected)
    except ValueError:
        raise HTTPException(400, "Invalid FEN or move")
    if not board.is_valid() or played not in board.legal_moves or expected not in board.legal_moves:
        raise HTTPException(400, "Illegal move for this position")
    if played == expected:
        return {"accepted": True, "verdict": "expected"}
    b = board.copy()
    b.push(played)
    if b.is_checkmate():
        return {"accepted": True, "verdict": "mate"}
    loss = mover_win_loss(_eval_after(board, expected), _eval_after(board, played), board.turn == chess.WHITE)
    ok = loss < ALSO_GOOD_MAX_LOSS
    return {"accepted": ok, "verdict": "good" if ok else "not_good"}
