# tests/test_maia_api.py
import os
os.environ["DATABASE_URL"] = "sqlite://"

import chess
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

import backend.main as main
from backend.config import MAIA_LEVELS
from backend.db import Base, Game
from backend.engine import maia_available
from backend.main import app, get_db

test_engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(test_engine)


def override_get_db():
    with Session(test_engine) as session:
        yield session


client = TestClient(app, raise_server_exceptions=False)
needs_maia = pytest.mark.skipif(not maia_available(), reason="lc0/Maia weights not installed")


@pytest.fixture(autouse=True)
def apply_db_override():
    previous = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    yield
    if previous is None:
        app.dependency_overrides.pop(get_db, None)
    else:
        app.dependency_overrides[get_db] = previous


def _start(**body):
    return client.post("/api/game", json={"player_color": "white", **body})


def test_engines_endpoint_reports_maia():
    data = client.get("/api/engines").json()
    assert data["maia"]["levels"] == [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900]
    assert data["maia"]["levels"] == MAIA_LEVELS
    assert data["maia"]["available"] == maia_available()


def test_game_defaults_to_stockfish():
    res = _start(engine_elo=1500)
    assert res.json()["engine"] == "stockfish"
    assert client.get(f"/api/game/{res.json()['game_id']}").json()["engine"] == "stockfish"


@needs_maia
def test_maia_game_plays_legal_reply():
    res = _start(engine="maia", engine_elo=1300)
    assert res.status_code == 200 and res.json()["engine"] == "maia"
    board = chess.Board(); board.push_uci("e2e4")
    move = client.post(f"/api/game/{res.json()['game_id']}/move", json={"uci": "e2e4"}).json()
    assert chess.Move.from_uci(move["engine_move"]) in board.legal_moves
    assert isinstance(move["engine_eval_cp"], float)


def test_maia_rejects_level_outside_range(monkeypatch):
    monkeypatch.setattr(main, "maia_available", lambda: True)
    assert _start(engine="maia", engine_elo=1000).status_code == 400


def test_maia_unavailable_rejected(monkeypatch):
    monkeypatch.setattr(main, "maia_available", lambda: False)
    res = _start(engine="maia", engine_elo=1300)
    assert res.status_code == 400
    assert "not installed" in res.json()["detail"]


@needs_maia
def test_stockfish_and_maia_games_interleave():
    sf = _start(engine_elo=1500).json()["game_id"]
    maia = _start(engine="maia", engine_elo=1300).json()["game_id"]
    for gid, uci in [(sf, "e2e4"), (maia, "d2d4"), (sf, "g1f3")]:
        assert client.post(f"/api/game/{gid}/move", json={"uci": uci}).status_code == 200


@needs_maia
def test_pgn_names_maia_opponent():
    gid = _start(engine="maia", engine_elo=1300).json()["game_id"]
    client.post(f"/api/game/{gid}/resign")
    with Session(test_engine) as db:
        assert '[Black "Maia 1300"]' in db.get(Game, gid).pgn


@needs_maia
def test_maia_receives_full_move_history(monkeypatch):
    from backend.engine import MaiaEngine
    seen = []
    real = MaiaEngine.get_best_move
    def spy(self, position, time_limit=0.1):
        seen.append(position)
        return real(self, position, time_limit)
    monkeypatch.setattr(MaiaEngine, "get_best_move", spy)
    gid = _start(engine="maia", engine_elo=1300).json()["game_id"]
    client.post(f"/api/game/{gid}/move", json={"uci": "e2e4"})
    reply = client.post(f"/api/game/{gid}/move", json={"uci": "g1f3"})
    assert reply.status_code == 200
    assert isinstance(seen[-1], chess.Board)
    assert [m.uci() for m in seen[-1].move_stack][:3] == ["e2e4", seen[0].move_stack[1].uci(), "g1f3"]
