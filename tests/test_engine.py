import chess
import pytest
from backend.engine import ChessEngine

STARTING_FEN = chess.STARTING_FEN
AFTER_E4_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"

@pytest.fixture
def engine():
    eng = ChessEngine(elo=1500)
    yield eng
    eng.close()

def test_get_best_move_returns_valid_uci(engine):
    move = engine.get_best_move(AFTER_E4_FEN)
    # UCI format: 4 chars (e2e4) or 5 chars with promotion (e7e8q)
    assert 4 <= len(move) <= 5
    # Must be a legal move
    board = chess.Board(AFTER_E4_FEN)
    assert chess.Move.from_uci(move) in board.legal_moves

def test_evaluate_returns_centipawns(engine):
    score = engine.evaluate(STARTING_FEN)
    assert score is not None
    assert isinstance(score, float)
    # Starting position is roughly equal (within 50cp)
    assert abs(score) < 50

def test_evaluate_mate_returns_large_value(engine):
    # Fool's mate — black checkmated
    fool = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"
    score = engine.evaluate(fool)
    assert score is not None
    assert score < -5000  # white is mated, strongly negative from white's POV
