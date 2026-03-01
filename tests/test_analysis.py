# tests/test_analysis.py
import os
os.environ["DATABASE_URL"] = "sqlite://"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.db import Base
from backend.main import app, get_db
from backend.game_utils import classify_move

test_engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(test_engine)

def override_get_db():
    with Session(test_engine) as session:
        yield session

app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


@pytest.fixture(autouse=True)
def apply_db_override():
    """Re-apply the DB override before each test to prevent other test modules from clobbering it."""
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides[get_db] = override_get_db


def test_classify_move_boundaries():
    assert classify_move(201) == "blunder"
    assert classify_move(200) == "blunder"
    assert classify_move(199) == "mistake"
    assert classify_move(100) == "mistake"
    assert classify_move(99) == "inaccuracy"
    assert classify_move(50) == "inaccuracy"
    assert classify_move(49) == "good"
    assert classify_move(0) == "good"
    assert classify_move(-30) == "good"

def test_analyze_completed_game():
    # Start a game and make a couple of moves
    game_res = client.post("/api/game", json={"player_color": "white", "engine_elo": 1500})
    game_id = game_res.json()["game_id"]

    client.post(f"/api/game/{game_id}/move", json={"uci": "e2e4"})
    client.post(f"/api/game/{game_id}/move", json={"uci": "d2d4"})

    # Manually mark game as complete
    with Session(test_engine) as db:
        from backend.db import Game
        game = db.get(Game, game_id)
        game.result = "1-0"
        db.commit()

    # Run analysis
    res = client.post(f"/api/game/{game_id}/analyze")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "analyzed"

    # Verify player moves have classifications
    state = client.get(f"/api/game/{game_id}")
    moves = state.json()["moves"]
    player_moves = [m for m in moves if m["ply"] % 2 == 1]  # white's moves (odd ply)
    for m in player_moves:
        assert m["classification"] in ("blunder", "mistake", "inaccuracy", "good")

def test_analyze_in_progress_game_returns_400():
    game_res = client.post("/api/game", json={"player_color": "white", "engine_elo": 1500})
    game_id = game_res.json()["game_id"]
    res = client.post(f"/api/game/{game_id}/analyze")
    assert res.status_code == 400
