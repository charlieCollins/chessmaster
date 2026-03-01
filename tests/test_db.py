# tests/test_db.py
import os
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

os.environ["DATABASE_URL"] = "sqlite://"  # in-memory for tests

from backend.db import Base, Game, Move, get_db_session

def test_game_model_creates_and_reads():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        game = Game(player_color="white", engine_elo=1500, result="*")
        session.add(game)
        session.commit()
        session.refresh(game)
        assert game.id is not None
        assert game.result == "*"

def test_move_model_linked_to_game():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        game = Game(player_color="white", engine_elo=1500, result="*")
        session.add(game)
        session.commit()
        move = Move(game_id=game.id, ply=1, uci="e2e4", san="e4")
        session.add(move)
        session.commit()
        assert move.id is not None
        assert move.game_id == game.id
