# tests/test_per_user.py
# Each signed-in user sees only their own games, stats and Learn progress; games are
# linkable by public id.
import os
os.environ["DATABASE_URL"] = "sqlite://"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.db import Base, Game, Move, get_db, init_db
from backend.identity import current_user
from backend.learn_api import get_corpus, get_puzzles_db
from backend.learn_content import load_corpus
from backend.main import app
from learn_fixtures import make_tiny_corpus

client = TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def env(tmp_path):
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
    yield eng, who
    app.dependency_overrides.clear()


def finished_game(eng, user, result="1-0"):
    with Session(eng) as s:
        g = Game(player_color="white", engine_elo=1300, engine="maia", result=result, user=user)
        s.add(g)
        s.flush()
        s.add(Move(game_id=g.id, ply=1, uci="e2e4", san="e4"))
        s.commit()
        return g.id, g.public_id


def test_me(env):
    assert client.get("/api/me").json() == {"user": "alice@example.com"}


def test_new_game_belongs_to_the_signed_in_user(env):
    eng, who = env
    gid = client.post("/api/game", json={"player_color": "white", "engine": "stockfish", "engine_elo": 1300}).json()["game_id"]
    with Session(eng) as s:
        assert s.get(Game, gid).user == "alice@example.com"


def test_lists_and_stats_are_per_user(env):
    eng, who = env
    finished_game(eng, "alice@example.com", "1-0")
    finished_game(eng, "bob@example.com", "0-1")
    finished_game(eng, "bob@example.com", "0-1")
    assert len(client.get("/api/games").json()) == 1
    assert client.get("/api/stats").json()["total"] == 1
    who["user"] = "bob@example.com"
    assert len(client.get("/api/games").json()) == 2
    assert client.get("/api/stats").json()["total"] == 2


def test_other_users_game_is_not_found(env):
    eng, who = env
    gid, _ = finished_game(eng, "bob@example.com")
    for method, path in [("get", f"/api/game/{gid}"), ("post", f"/api/game/{gid}/analyze"),
                         ("get", f"/api/game/{gid}/hint"), ("post", f"/api/game/{gid}/resign"),
                         ("post", f"/api/game/{gid}/takeback"),
                         ("post", f"/api/game/{gid}/move")]:
        kw = {"json": {"uci": "e7e5"}} if path.endswith("/move") else {}
        assert getattr(client, method)(path, **kw).status_code == 404, path
    assert client.delete(f"/api/game/{gid}").status_code == 404
    with Session(eng) as s:
        assert s.get(Game, gid) is not None          # still there


def test_lookup_by_public_or_numeric_id(env):
    eng, who = env
    gid, pid = finished_game(eng, "alice@example.com")
    assert client.get(f"/api/games/lookup?id={pid}").json() == {"game_id": gid, "public_id": pid}
    assert client.get(f"/api/games/lookup?id={gid}").json() == {"game_id": gid, "public_id": pid}
    assert client.get("/api/games/lookup?id=zzzzzz").status_code == 404
    who["user"] = "bob@example.com"
    assert client.get(f"/api/games/lookup?id={pid}").status_code == 404


def _attempt(ref, solved=True, **kw):
    body = {"kind": "puzzle", "ref": ref, "topic": "forks", "context": "lesson", "solved": solved,
            "revealed": False, "seconds": 5, "puzzle_rating": 1300}
    body.update(kw)
    return client.post("/api/learn/attempts", json=body).json()


def test_learn_rating_reviews_and_seen_puzzles_are_per_user(env):
    eng, who = env
    assert _attempt("p1300", solved=True)["rated"]
    alice_after = _attempt("p1350", solved=False)["rating_after"]   # alice: miss → review queue
    assert client.get("/api/learn/topics").json()["rating"] == alice_after != 1300
    who["user"] = "bob@example.com"
    t = client.get("/api/learn/topics").json()
    assert t["rating"] == 1300 and t["reviews_due"] == 0
    a = _attempt("p1300", solved=False)                   # bob's first try at the same puzzle is rated
    assert a["rated"] and a["rating_after"] < 1300
    seen_by_bob = {p["id"] for p in client.get("/api/learn/topics/forks/puzzles?n=10").json()["puzzles"]}
    assert "p1350" in seen_by_bob or len(seen_by_bob) >= 3   # alice's attempts don't hide puzzles from bob
    assert "p1300" not in seen_by_bob
    who["user"] = "alice@example.com"                    # bob's tries didn't touch alice
    assert client.get("/api/learn/topics").json()["rating"] == alice_after


def test_migration_gives_existing_data_to_the_owner(monkeypatch, tmp_path):
    db_file = tmp_path / "old.db"
    eng = create_engine(f"sqlite:///{db_file}")
    with eng.begin() as c:                                    # a pre-user schema with data
        c.execute(text("CREATE TABLE games (id INTEGER PRIMARY KEY, pgn TEXT, result TEXT, player_color TEXT, "
                       "engine_elo INTEGER, played_at DATETIME, source TEXT, analyzed INTEGER)"))
        c.execute(text("INSERT INTO games (id, result, player_color, engine_elo) VALUES (1, '1-0', 'white', 1300)"))
        c.execute(text("CREATE TABLE learn_state (key TEXT PRIMARY KEY, value FLOAT NOT NULL)"))
        c.execute(text("INSERT INTO learn_state VALUES ('puzzle_rating', 1444.0)"))
        c.execute(text("CREATE TABLE learn_reviews (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, ref TEXT NOT NULL, "
                       "topic TEXT, step INTEGER NOT NULL, due_at DATETIME NOT NULL, updated_at DATETIME)"))
        c.execute(text("CREATE UNIQUE INDEX ux_learn_reviews_item ON learn_reviews (kind, ref)"))
    monkeypatch.setenv("CHESS_OWNER", "owner@example.com")
    init_db(eng)
    init_db(eng)                                              # idempotent
    with eng.connect() as c:
        assert c.execute(text("SELECT user FROM games")).scalar() == "owner@example.com"
        assert c.execute(text("SELECT value FROM learn_user_state WHERE user='owner@example.com' "
                              "AND key='puzzle_rating'")).scalar() == 1444.0
        idx = {r[1] for r in c.execute(text("PRAGMA index_list(learn_reviews)"))}
        assert "ux_learn_reviews_item" not in idx and "ux_learn_reviews_user_item" in idx
