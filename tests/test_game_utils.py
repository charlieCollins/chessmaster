import os
os.environ["DATABASE_URL"] = "sqlite://"

import chess
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from backend.db import Base, Game, Move
from backend.game_utils import reconstruct_board, generate_pgn, classify_move

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
    assert classify_move(250) == "blunder"
    assert classify_move(200) == "blunder"
    assert classify_move(199) == "mistake"
    assert classify_move(100) == "mistake"
    assert classify_move(99) == "inaccuracy"
    assert classify_move(50) == "inaccuracy"
    assert classify_move(49) == "good"
    assert classify_move(0) == "best"
    assert classify_move(-10) == "best"   # actually gained eval

def test_generate_pgn(db):
    game = _make_game_with_moves(db)
    pgn = generate_pgn(game.id, db)
    assert "e4" in pgn
    assert "e5" in pgn
