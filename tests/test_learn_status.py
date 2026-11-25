# tests/test_learn_status.py
# GET /api/learn/status — what you've studied, practised and passed; POST .../studied marks a lesson read.
import os
os.environ["DATABASE_URL"] = "sqlite://"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.db import Base, get_db
from backend.identity import current_user
from backend.learn_api import get_corpus, get_puzzles_db
from backend.learn_content import load_corpus
from backend.main import app
from learn_fixtures import make_tiny_corpus

client = TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def who(tmp_path):
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(eng)
    corpus_dir = make_tiny_corpus(tmp_path)
    corpus = load_corpus(corpus_dir)
    who = {"user": "alice@example.com"}

    def db():
        with Session(eng) as s:
            yield s
    app.dependency_overrides[get_db] = db
    app.dependency_overrides[current_user] = lambda: who["user"]
    app.dependency_overrides[get_corpus] = lambda: corpus
    app.dependency_overrides[get_puzzles_db] = lambda: corpus_dir / "puzzles/puzzles.sqlite"
    yield who
    app.dependency_overrides.clear()


def attempt(ref, solved=True, kind="puzzle", topic="forks", **kw):
    body = {"kind": kind, "ref": ref, "topic": topic, "context": "lesson", "solved": solved,
            "revealed": False, "seconds": 5, "puzzle_rating": 1300 if kind == "puzzle" else None}
    body.update(kw)
    assert client.post("/api/learn/attempts", json=body).status_code == 200


def topics(status):
    return {t["slug"]: t for g in status["groups"] for t in g["topics"]}


def test_fresh_user_has_everything_new(who):
    s = client.get("/api/learn/status").json()
    assert s["rating"] == 1300 and s["rated_attempts"] == 0 and s["rating_history"] == []
    assert s["counts"] == {"new": 3, "studied": 0, "practising": 0, "passed": 0}
    t = topics(s)
    assert [g["group"] for g in s["groups"]] == ["Pieces", "Tactics", "Endgames"]
    assert t["knights"]["status"] == "new" and t["knights"]["last_activity"] is None
    assert t["basic-mates"]["drills"] == {"total": 1, "tried": 0, "solved": 0}


def test_marking_a_lesson_studied(who):
    assert client.post("/api/learn/topics/knights/studied").status_code == 200
    assert client.post("/api/learn/topics/knights/studied").status_code == 200   # idempotent
    t = topics(client.get("/api/learn/status").json())
    assert t["knights"]["status"] == "studied" and t["knights"]["studied_at"]
    assert t["forks"]["status"] == "new"
    assert client.post("/api/learn/topics/nope/studied").status_code == 404


def test_puzzles_move_a_topic_to_practising_and_record_rating_history(who):
    attempt("p1300", solved=False)
    attempt("p1250", solved=True)
    s = client.get("/api/learn/status").json()
    f = topics(s)["forks"]
    assert f["status"] == "practising"
    assert f["puzzles"]["attempts"] == 2 and f["puzzles"]["solved"] == 1
    assert f["reviews_queued"] == 1 and f["last_activity"]
    assert s["rated_attempts"] == 2 and len(s["rating_history"]) == 2
    assert s["rating_history"][-1]["rating"] == pytest.approx(s["rating"], abs=0.1)
    assert s["reviews_queued"] == 1


def test_book_topic_passes_when_its_drill_is_solved(who):
    attempt("tiny:Fig1", solved=False, kind="book", topic="basic-mates")
    assert topics(client.get("/api/learn/status").json())["basic-mates"]["status"] == "practising"
    attempt("tiny:Fig1", solved=True, kind="book", topic="basic-mates")
    s = client.get("/api/learn/status").json()
    assert topics(s)["basic-mates"]["status"] == "passed"
    assert topics(s)["basic-mates"]["drills"] == {"total": 1, "tried": 1, "solved": 1}
    assert s["counts"]["passed"] == 1


def test_status_is_per_user(who):
    client.post("/api/learn/topics/knights/studied")
    attempt("p1300", solved=True)
    who["user"] = "bob@example.com"
    s = client.get("/api/learn/status").json()
    assert s["counts"]["new"] == 3 and s["rated_attempts"] == 0
