# tests/test_game_api.py
import os
os.environ["DATABASE_URL"] = "sqlite://"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.db import Base
from backend.main import app, get_db

# Override DB to use in-memory SQLite
# StaticPool ensures all connections share the same in-memory database
test_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
Base.metadata.create_all(test_engine)

def override_get_db():
    with Session(test_engine) as session:
        yield session

app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)

def test_start_game_as_white():
    res = client.post("/api/game", json={"player_color": "white", "engine_elo": 1500})
    assert res.status_code == 200
    data = res.json()
    assert "game_id" in data
    assert data["player_color"] == "white"
    assert "fen" in data
    assert data["engine_first_move"] is None  # white moves first

def test_start_game_as_black():
    res = client.post("/api/game", json={"player_color": "black", "engine_elo": 1500})
    assert res.status_code == 200
    data = res.json()
    assert data["engine_first_move"] is not None  # engine opens for black player
    assert len(data["engine_first_move"]) >= 4

def test_make_legal_move():
    game_res = client.post("/api/game", json={"player_color": "white", "engine_elo": 1500})
    game_id = game_res.json()["game_id"]
    move_res = client.post(f"/api/game/{game_id}/move", json={"uci": "e2e4"})
    assert move_res.status_code == 200
    data = move_res.json()
    assert "fen" in data
    assert "engine_move" in data
    assert data["game_over"] is False

def test_make_illegal_move():
    game_res = client.post("/api/game", json={"player_color": "white", "engine_elo": 1500})
    game_id = game_res.json()["game_id"]
    res = client.post(f"/api/game/{game_id}/move", json={"uci": "e2e5"})
    assert res.status_code == 400

def test_get_game_state():
    game_res = client.post("/api/game", json={"player_color": "white", "engine_elo": 1500})
    game_id = game_res.json()["game_id"]
    client.post(f"/api/game/{game_id}/move", json={"uci": "e2e4"})
    state = client.get(f"/api/game/{game_id}")
    assert state.status_code == 200
    data = state.json()
    assert "fen" in data
    assert "moves" in data
    assert len(data["moves"]) >= 2  # player move + engine response
