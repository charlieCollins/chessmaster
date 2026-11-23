# tests/test_learn_api.py
import os
os.environ["DATABASE_URL"] = "sqlite://"

import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.db import Base, LearnReview, get_db
from backend.learn_api import get_corpus, get_puzzles_db
from backend.learn_content import load_corpus
from backend.main import app
from learn_fixtures import make_tiny_corpus

client = TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def env(tmp_path):
    """Fresh DB + tiny corpus per test; restores the app's dependencies afterwards."""
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(eng)
    corpus_dir = make_tiny_corpus(tmp_path)
    corpus = load_corpus(corpus_dir)

    def db():
        with Session(eng) as s:
            yield s
    app.dependency_overrides[get_db] = db
    app.dependency_overrides[get_corpus] = lambda: corpus
    app.dependency_overrides[get_puzzles_db] = lambda: corpus_dir / "puzzles/puzzles.sqlite"
    yield eng
    app.dependency_overrides.clear()


def attempt(**kw):
    body = {"kind": "puzzle", "ref": "p1300", "topic": "forks", "context": "lesson", "solved": True,
            "revealed": False, "seconds": 12.0, "puzzle_rating": 1300}
    body.update(kw)
    return client.post("/api/learn/attempts", json=body)


def test_topics_listing(env):
    r = client.get("/api/learn/topics").json()
    assert r["rating"] == 1300 and r["reviews_due"] == 0
    assert [g["group"] for g in r["groups"]] == ["Pieces", "Tactics", "Endgames"]
    knights = r["groups"][0]["topics"][0]
    assert knights["slug"] == "knights" and knights["progress"]["accuracy"] is None


def test_topic_detail_and_404(env):
    d = client.get("/api/learn/topics/knights").json()
    assert d["drills"][0]["ref"] == "tiny:Fig1" and d["puzzles_available"] is True
    assert client.get("/api/learn/topics/nope").status_code == 404


def test_puzzles_near_rating_and_not_repeated(env):
    r = client.get("/api/learn/topics/forks/puzzles?n=3").json()
    assert r["rating"] == 1300
    ids = {p["id"] for p in r["puzzles"]}
    assert len(ids) == 3 and ids <= {"p1200", "p1250", "p1300", "p1350"}      # 1300 ± 150
    attempt(ref="p1300")
    again = {p["id"] for p in client.get("/api/learn/topics/forks/puzzles?n=10").json()["puzzles"]}
    assert again == {"p1200", "p1250", "p1350", "p1500"}     # widened to ± 300; attempted one skipped


def test_topic_without_themes_has_no_puzzles(env):
    assert client.get("/api/learn/topics/basic-mates/puzzles").json()["puzzles"] == []


def test_rated_once(env):
    a = attempt(ref="p1300", solved=True).json()
    assert a["rated"] and a["rating_before"] == 1300 and a["rating_after"] == pytest.approx(1320)
    b = attempt(ref="p1300", solved=False).json()
    assert b["rated"] is False and b["rating_after"] is None
    assert client.get("/api/learn/topics").json()["rating"] == pytest.approx(1320)


def test_review_attempts_are_not_rated(env):
    a = attempt(ref="p1250", context="review", solved=True).json()
    assert a["rated"] is False


def test_book_miss_queues_review_due_tomorrow(env):
    a = attempt(kind="book", ref="tiny:Fig1", topic="knights", solved=False, puzzle_rating=None).json()
    assert a["rated"] is False and a["review"]["step"] == 0
    assert client.get("/api/learn/reviews").json()["items"] == []
    with Session(env) as s:
        s.query(LearnReview).update({"due_at": datetime.datetime(2000, 1, 1)})
        s.commit()
    items = client.get("/api/learn/reviews").json()["items"]
    assert items[0]["ref"] == "tiny:Fig1" and items[0]["position"]["line_uci"] == ["g2g4", "a7a5"]
    assert client.get("/api/learn/topics").json()["reviews_due"] == 1
    nxt = attempt(kind="book", ref="tiny:Fig1", topic="knights", context="review", solved=True,
                  puzzle_rating=None).json()
    assert nxt["review"]["step"] == 1


def test_revealed_counts_as_miss(env):
    a = attempt(ref="p1350", solved=True, revealed=True).json()
    assert a["review"]["step"] == 0 and a["rating_after"] < 1300


def test_drill_only_topic_progress(env):
    attempt(kind="book", ref="tiny:Fig1", topic="basic-mates", solved=True, puzzle_rating=None)
    groups = client.get("/api/learn/topics").json()["groups"]
    bm = next(t for g in groups for t in g["topics"] if t["slug"] == "basic-mates")
    assert bm["progress"] == {"attempts": 1, "solved": 1, "accuracy": 1.0}


def test_no_puzzle_db(env, tmp_path):
    app.dependency_overrides[get_puzzles_db] = lambda: tmp_path / "missing.sqlite"
    assert client.get("/api/learn/topics").status_code == 200
    assert client.get("/api/learn/topics/knights").json()["puzzles_available"] is False
    r = client.get("/api/learn/topics/forks/puzzles")
    assert r.status_code == 503 and "build_corpus.py puzzles" in r.json()["detail"]
    attempt(kind="book", ref="tiny:Fig1", topic="knights", solved=False, puzzle_rating=None)
    with Session(env) as s:
        s.query(LearnReview).update({"due_at": datetime.datetime(2000, 1, 1)})
        s.commit()
    assert [i["ref"] for i in client.get("/api/learn/reviews").json()["items"]] == ["tiny:Fig1"]


START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
AFTER_NF3 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2"


def test_judge_expected_move_needs_no_engine(env):
    assert client.post("/api/learn/judge", json={"fen": START, "move": "e2e4", "expected": "e2e4"}).json() == \
        {"accepted": True, "verdict": "expected"}


def test_judge_equal_alternative_is_good(env):
    r = client.post("/api/learn/judge", json={"fen": START, "move": "e2e4", "expected": "d2d4"}).json()
    assert r == {"accepted": True, "verdict": "good"}


def test_judge_blunder_is_not_good(env):
    r = client.post("/api/learn/judge", json={"fen": AFTER_NF3, "move": "d8g5", "expected": "b8c6"}).json()
    assert r == {"accepted": False, "verdict": "not_good"}


def test_judge_mate_is_accepted(env):
    fen = "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1"
    r = client.post("/api/learn/judge", json={"fen": fen, "move": "a1a8", "expected": "g1f2"}).json()
    assert r == {"accepted": True, "verdict": "mate"}


def test_judge_rejects_illegal(env):
    assert client.post("/api/learn/judge", json={"fen": START, "move": "e2e5", "expected": "e2e4"}).status_code == 400
    assert client.post("/api/learn/judge", json={"fen": "bad", "move": "e2e4", "expected": "e2e4"}).status_code == 400


def test_lesson_solve_does_not_advance_a_queued_review(env):
    """Re-solving a missed drill straight away (lesson context) must not skip spaced review."""
    miss = attempt(kind="book", ref="tiny:Fig1", topic="knights", solved=False, puzzle_rating=None).json()
    again = attempt(kind="book", ref="tiny:Fig1", topic="knights", solved=True, puzzle_rating=None).json()
    assert again["review"] == miss["review"]          # still step 0, same due date
    with Session(env) as s:
        row = s.query(LearnReview).one()
        assert row.step == 0
