# tests/test_robustness.py
"""API-level regression tests for the 2026-11 audit findings."""
import os
os.environ["DATABASE_URL"] = "sqlite://"

import chess
import chess.engine
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

import backend.main as main
from backend.db import Base, Game, Move
from backend.engine import ChessEngine
from backend.main import app, get_db

test_engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(test_engine)


def override_get_db():
    with Session(test_engine) as session:
        yield session


client = TestClient(app, raise_server_exceptions=False)

# Parses as FEN but has no black king — crashes Stockfish (SIGSEGV) if sent to it.
KINGLESS_FEN = "8/8/8/8/8/8/8/QR5K w - - 0 1"


@pytest.fixture(autouse=True)
def apply_db_override():
    previous = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    yield
    if previous is None:
        app.dependency_overrides.pop(get_db, None)
    else:
        app.dependency_overrides[get_db] = previous


def _new_game(color="white", elo=1500, moves=()):
    """Create a game directly in the DB with the given UCI moves already played."""
    with Session(test_engine) as db:
        game = Game(player_color=color, engine_elo=elo, result="*")
        db.add(game)
        db.commit()
        board = chess.Board()
        for ply, uci in enumerate(moves, start=1):
            mv = chess.Move.from_uci(uci)
            db.add(Move(game_id=game.id, ply=ply, uci=uci, san=board.san(mv)))
            board.push(mv)
        db.commit()
        return game.id


def _move_count(game_id):
    with Session(test_engine) as db:
        return db.query(Move).filter(Move.game_id == game_id).count()


# ── Engine robustness ────────────────────────────────────────────────────────

def test_engine_best_rejects_invalid_position():
    res = client.post("/api/engine/best", json={"fen": KINGLESS_FEN})
    assert res.status_code == 400


def test_hint_engine_recovers_after_stockfish_crash():
    # Crash the shared full-strength engine by feeding it an impossible position
    # directly (bypassing the API's validation).
    with pytest.raises(chess.engine.EngineTerminatedError):
        main.run_hint_engine(lambda eng: eng.get_best_move(KINGLESS_FEN, 0.1))
    res = client.post("/api/engine/best", json={"fen": chess.STARTING_FEN})
    assert res.status_code == 200


def test_engine_failure_does_not_persist_player_move(monkeypatch):
    game_id = _new_game()

    def boom(*args, **kwargs):
        raise chess.engine.EngineError("simulated engine failure")

    monkeypatch.setattr(ChessEngine, "get_best_move", boom)
    monkeypatch.setattr(ChessEngine, "analyse_position", boom)
    res = client.post(f"/api/game/{game_id}/move", json={"uci": "e2e4"})
    assert res.status_code == 500
    assert _move_count(game_id) == 0  # nothing half-saved

    monkeypatch.undo()
    res = client.post(f"/api/game/{game_id}/move", json={"uci": "e2e4"})  # retry works
    assert res.status_code == 200
    assert _move_count(game_id) == 2


def test_engine_failure_on_black_start_leaves_no_orphan_game(monkeypatch):
    with Session(test_engine) as db:
        before = db.query(Game).count()

    def boom(*args, **kwargs):
        raise chess.engine.EngineError("simulated engine failure")

    monkeypatch.setattr(ChessEngine, "get_best_move", boom)
    res = client.post("/api/game", json={"player_color": "black", "engine_elo": 1500})
    assert res.status_code == 500
    with Session(test_engine) as db:
        assert db.query(Game).count() == before


# ── Move response contract ───────────────────────────────────────────────────

def test_engine_checkmate_reports_termination():
    # 1.f3 e5 2.g4?? — engine (black) mates with Qh4#
    game_id = _new_game(elo=3000, moves=["f2f3", "e7e5"])
    res = client.post(f"/api/game/{game_id}/move", json={"uci": "g2g4"})
    data = res.json()
    assert data["engine_move"] == "d8h4"
    assert data["game_over"] is True
    assert data["result"] == "0-1"
    assert data["termination"] == "checkmate"


def test_move_returns_full_strength_evals_for_both_positions():
    # 1.e4 e5 2.Qh5 Nc6 3.Qxe5+?? hangs the queen to Nxe5
    game_id = _new_game(elo=3000, moves=["e2e4", "e7e5", "d1h5", "b8c6"])
    res = client.post(f"/api/game/{game_id}/move", json={"uci": "h5e5"})
    data = res.json()
    assert data["engine_move"] == "c6e5"
    assert data["eval_cp"] < -500          # after my move: queen hangs
    assert data["engine_eval_cp"] < -500   # after engine's reply: queen is gone


# ── Accuracy (single definition shared by Home + Review) ─────────────────────

def _analyzed_game_with(classifications, color="white"):
    game_id = _new_game(color=color, moves=["e2e4", "e7e5", "g1f3", "b8c6"][: len(classifications)])
    with Session(test_engine) as db:
        game = db.get(Game, game_id)
        game.result = "1-0"
        game.analyzed = 1
        for m, c in zip(db.query(Move).filter(Move.game_id == game_id).order_by(Move.ply), classifications):
            m.classification = c
        db.commit()
    return game_id


def test_get_game_returns_weighted_accuracy_per_side():
    # white: best(100) + mistake(30) -> 65 ; black: good(85) + blunder(0) -> 42.5 -> 42
    game_id = _analyzed_game_with(["best", "good", "mistake", "blunder"])
    acc = client.get(f"/api/game/{game_id}").json()["accuracy"]
    assert acc["white"]["pct"] == 65
    assert acc["white"]["n"] == 2
    assert acc["black"]["counts"] == {"good": 1, "blunder": 1}


def test_stats_accuracy_uses_same_weighting_as_review():
    with Session(test_engine) as db:  # isolate from games created by other tests
        db.query(Move).delete()
        db.query(Game).delete()
        db.commit()
    _analyzed_game_with(["best", "good", "mistake", "blunder"])  # player = white
    stats = client.get("/api/stats").json()
    assert stats["accuracy"] == 65.0


# ── Coverage for previously untested endpoints ───────────────────────────────

def test_hint_marks_game_assisted():
    game_id = _new_game()
    assert client.get(f"/api/game/{game_id}/hint").status_code == 200
    assert client.get(f"/api/game/{game_id}").json()["assisted"] is True


def test_takeback_removes_last_two_plies_and_marks_assisted():
    game_id = _new_game(moves=["e2e4", "e7e5", "g1f3", "b8c6"])
    res = client.post(f"/api/game/{game_id}/takeback")
    assert res.status_code == 200
    state = client.get(f"/api/game/{game_id}").json()
    assert [m["uci"] for m in state["moves"]] == ["e2e4", "e7e5"]
    assert state["assisted"] is True


def test_resign_sets_loss_for_player():
    game_id = _new_game(color="black", moves=["e2e4"])
    assert client.post(f"/api/game/{game_id}/resign").json()["result"] == "1-0"
    assert client.post(f"/api/game/{game_id}/resign").status_code == 400  # already over


def test_delete_removes_game_and_moves():
    game_id = _new_game(moves=["e2e4", "e7e5"])
    assert client.delete(f"/api/game/{game_id}").status_code == 200
    assert client.get(f"/api/game/{game_id}").status_code == 404
    assert _move_count(game_id) == 0


def test_games_list_includes_player_accuracy():
    game_id = _analyzed_game_with(["best", "good", "mistake", "blunder"])  # player = white
    row = next(r for r in client.get("/api/games").json() if r["game_id"] == game_id)
    assert row["accuracy"] == 65.0
