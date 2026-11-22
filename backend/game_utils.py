# backend/game_utils.py
import chess
import chess.pgn
from sqlalchemy.orm import Session
from .db import Move, Game


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
    """Generate PGN string from stored moves, including standard headers."""
    db_game = db.get(Game, game_id)
    moves = (
        db.query(Move)
        .filter(Move.game_id == game_id)
        .order_by(Move.ply)
        .all()
    )
    game_node = chess.pgn.Game()
    if db_game is not None:
        game_node.headers["White"] = "Player" if db_game.player_color == "white" else "Stockfish"
        game_node.headers["Black"] = "Stockfish" if db_game.player_color == "white" else "Player"
        game_node.headers["Result"] = db_game.result if db_game.result else "*"
        game_node.headers["Date"] = (
            db_game.played_at.strftime("%Y.%m.%d") if db_game.played_at else "????.??.??"
        )
    node = game_node
    board = chess.Board()
    for move in moves:
        try:
            chess_move = chess.Move.from_uci(move.uci)
            if chess_move not in board.legal_moves:
                break  # stop at first illegal move; PGN up to this point is valid
            node = node.add_variation(chess_move)
            board.push(chess_move)
        except (ValueError, chess.InvalidMoveError):
            break
    exporter = chess.pgn.StringExporter(headers=True, comments=False, variations=False)
    return game_node.accept(exporter)


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
