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
from .learn_content import Corpus, find_drill, load_corpus, topic_detail, topic_summaries
from .learn_progress import START_RATING, next_review, topic_progress, update_rating

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


def _state(db: Session, key: str, default: float) -> float:
    row = db.get(LearnState, key)
    return row.value if row else default


def _set_state(db: Session, key: str, value: float) -> None:
    row = db.get(LearnState, key)
    if row:
        row.value = value
    else:
        db.add(LearnState(key=key, value=value))


# ── Topics ──────────────────────────────────────────────────────────────────────
def _progress(db: Session, corpus: Corpus, t: dict) -> dict:
    if t["has_puzzles"]:
        rows = (db.query(LearnAttempt.solved)
                .filter(LearnAttempt.topic == t["slug"], LearnAttempt.kind == "puzzle",
                        LearnAttempt.rating_after.isnot(None))
                .order_by(LearnAttempt.id).all())
        return topic_progress([bool(r[0]) for r in rows])
    drills = (topic_detail(corpus, t["slug"]) or {}).get("drills", [])
    latest: dict[str, bool] = {}
    if drills:
        rows = (db.query(LearnAttempt.ref, LearnAttempt.solved)
                .filter(LearnAttempt.kind == "book", LearnAttempt.ref.in_([d["ref"] for d in drills]))
                .order_by(LearnAttempt.id).all())
        latest = {ref: bool(solved) for ref, solved in rows}
    solved = sum(latest.values())
    return {"attempts": len(latest), "solved": solved,
            "accuracy": solved / len(drills) if latest else None}


@router.get("/topics")
def list_topics(db: Session = Depends(get_db), corpus: Corpus = Depends(get_corpus)):
    groups: list[dict] = []
    for t in topic_summaries(corpus):
        if not groups or groups[-1]["group"] != t["group"]:
            groups.append({"group": t["group"], "topics": []})
        groups[-1]["topics"].append({**t, "progress": _progress(db, corpus, t)})
    due = db.query(LearnReview).filter(LearnReview.due_at <= _now()).count()
    return {"rating": _state(db, "puzzle_rating", START_RATING), "reviews_due": due, "groups": groups}


@router.get("/topics/{slug}")
def get_topic(slug: str, corpus: Corpus = Depends(get_corpus), puzzles_db: Path = Depends(get_puzzles_db)):
    detail = topic_detail(corpus, slug)
    if detail is None:
        raise HTTPException(404, "Unknown topic")
    return {**detail, "puzzles_available": bool(detail["themes"]) and Path(puzzles_db).exists()}


@router.get("/topics/{slug}/puzzles")
def topic_puzzles(slug: str, n: int = 10, db: Session = Depends(get_db),
                  corpus: Corpus = Depends(get_corpus), puzzles_db: Path = Depends(get_puzzles_db)):
    detail = topic_detail(corpus, slug)
    if detail is None:
        raise HTTPException(404, "Unknown topic")
    rating = _state(db, "puzzle_rating", START_RATING)
    if not detail["themes"]:
        return {"rating": rating, "puzzles": []}
    if not Path(puzzles_db).exists():
        raise HTTPException(503, NO_PUZZLE_DB)
    seen = {r[0] for r in db.query(LearnAttempt.ref).filter(LearnAttempt.kind == "puzzle").all()}
    puzzles = select_puzzles(puzzles_db, detail["themes"], rating, max(1, min(n, 20)), seen)
    return {"rating": rating, "puzzles": [{k: p[k] for k in ("id", "fen", "moves", "rating", "themes")}
                                           for p in puzzles]}


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
def record_attempt(req: AttemptRequest, db: Session = Depends(get_db)):
    solved = req.solved and not req.revealed          # a shown solution is a miss
    first = db.query(LearnAttempt).filter(LearnAttempt.kind == req.kind, LearnAttempt.ref == req.ref).first() is None
    rated = req.kind == "puzzle" and req.context == "lesson" and first and req.puzzle_rating is not None
    before = after = None
    if rated:
        before = _state(db, "puzzle_rating", START_RATING)
        n_rated = int(_state(db, "rated_attempts", 0))
        after = update_rating(before, req.puzzle_rating, solved, n_rated)
        _set_state(db, "puzzle_rating", after)
        _set_state(db, "rated_attempts", n_rated + 1)
    now = _now()
    db.add(LearnAttempt(kind=req.kind, ref=req.ref, topic=req.topic, context=req.context, solved=int(solved),
                        revealed=int(req.revealed), seconds=req.seconds, puzzle_rating=req.puzzle_rating,
                        rating_before=before, rating_after=after, created_at=now))
    item = db.query(LearnReview).filter(LearnReview.kind == req.kind, LearnReview.ref == req.ref).first()
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
            db.add(LearnReview(kind=req.kind, ref=req.ref, topic=req.topic, step=step, due_at=due, updated_at=now))
        review = {"step": step, "due_at": due.isoformat()}
    db.commit()
    return {"rated": rated, "rating_before": before, "rating_after": after, "review": review}


@router.get("/reviews")
def due_reviews(db: Session = Depends(get_db), corpus: Corpus = Depends(get_corpus),
                puzzles_db: Path = Depends(get_puzzles_db)):
    have_db = Path(puzzles_db).exists()
    items = []
    for r in db.query(LearnReview).filter(LearnReview.due_at <= _now()).order_by(LearnReview.due_at).all():
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
