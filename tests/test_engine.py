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


def test_evaluate_black_mated_is_positive_for_white(engine):
    # 1.e4 f6 2.d4 g5 3.Qh5# — black is checkmated, so White's POV is winning
    black_mated = "rnbqkbnr/ppppp2p/5p2/6pQ/3PP3/8/PPP2PPP/RNB1KBNR b KQkq - 1 3"
    assert chess.Board(black_mated).is_checkmate()
    assert engine.evaluate(black_mated) > 5000


def test_evaluate_stalemate_is_zero(engine):
    stalemate = "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"
    assert chess.Board(stalemate).is_stalemate()
    assert engine.evaluate(stalemate) == 0.0
