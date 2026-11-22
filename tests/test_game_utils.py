import os
os.environ["DATABASE_URL"] = "sqlite://"

import chess
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from backend.db import Base, Game, Move
from backend.game_utils import reconstruct_board, generate_pgn, classify_move, win_percent, mover_win_loss

@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session

def _make_game_with_moves(db):
    game = Game(player_color="white", engine_elo=1500, result="*")
    db.add(game)
    db.commit()
    # e4 e5
    db.add(Move(game_id=game.id, ply=1, uci="e2e4", san="e4"))
    db.add(Move(game_id=game.id, ply=2, uci="e7e5", san="e5"))
    db.commit()
    return game

def test_reconstruct_board_returns_correct_fen(db):
    game = _make_game_with_moves(db)
    board = reconstruct_board(game.id, db)
    expected_fen = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2"
    assert board.fen() == expected_fen

def test_reconstruct_board_empty_game(db):
    game = Game(player_color="white", engine_elo=1500, result="*")
    db.add(game)
    db.commit()
    board = reconstruct_board(game.id, db)
    assert board.fen() == chess.STARTING_FEN

def test_classify_move():
    # Thresholds are in win-percentage points lost (Lichess-style), not centipawns
    assert classify_move(30) == "blunder"
    assert classify_move(15) == "blunder"
    assert classify_move(14.9) == "mistake"
    assert classify_move(10) == "mistake"
    assert classify_move(9.9) == "inaccuracy"
    assert classify_move(5) == "inaccuracy"
    assert classify_move(4.9) == "good"
    assert classify_move(0) == "best"
    assert classify_move(-2) == "best"

def test_generate_pgn(db):
    game = _make_game_with_moves(db)
    pgn = generate_pgn(game.id, db)
    assert "e4" in pgn
    assert "e5" in pgn


def test_win_percent_is_symmetric_and_bounded():
    assert win_percent(0) == 50
    assert win_percent(300) + win_percent(-300) == pytest.approx(100)
    assert win_percent(10000) > 99.9


def test_mover_win_loss_uses_movers_perspective():
    assert mover_win_loss(0, -300, mover_is_white=True) > 0    # white got worse
    assert mover_win_loss(0, 300, mover_is_white=False) > 0    # black got worse
    assert mover_win_loss(0, 300, mover_is_white=True) == 0    # gains are clamped to 0


def test_same_cp_drop_matters_less_in_decided_positions():
    # 300cp thrown away from equal is a blunder ...
    assert classify_move(mover_win_loss(0, -300, mover_is_white=True)) == "blunder"
    # ... but +9 -> +6 in a completely won game is not
    assert classify_move(mover_win_loss(900, 600, mover_is_white=True)) != "blunder"
    # Losing a forced mate while still a queen up is not a blunder either
    assert classify_move(mover_win_loss(10000, 900, mover_is_white=True)) != "blunder"
