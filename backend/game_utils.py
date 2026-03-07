# backend/game_utils.py
import chess
import chess.pgn
from sqlalchemy.orm import Session
from .db import Move


def reconstruct_board(game_id: int, db: Session) -> chess.Board:
    """Replay all stored moves to get current board state."""
    moves = (
        db.query(Move)
        .filter(Move.game_id == game_id)
        .order_by(Move.ply)
        .all()
    )
    board = chess.Board()
    for move in moves:
        board.push(chess.Move.from_uci(move.uci))
    return board


def generate_pgn(game_id: int, db: Session) -> str:
    """Generate PGN string from stored moves."""
    moves = (
        db.query(Move)
        .filter(Move.game_id == game_id)
        .order_by(Move.ply)
        .all()
    )
    game = chess.pgn.Game()
    node = game
    for move in moves:
        chess_move = chess.Move.from_uci(move.uci)
        node = node.add_variation(chess_move)
    exporter = chess.pgn.StringExporter(headers=False, comments=False, variations=False)
    return game.accept(exporter)


def classify_move(eval_loss_cp: float) -> str:
    """Classify a move based on centipawn loss vs best move."""
    if eval_loss_cp <= 0:
        return "best"
    elif eval_loss_cp < 50:
        return "good"
    elif eval_loss_cp < 100:
        return "inaccuracy"
    elif eval_loss_cp < 200:
        return "mistake"
    else:
        return "blunder"
