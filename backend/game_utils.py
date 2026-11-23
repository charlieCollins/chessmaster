# backend/game_utils.py
import math
from typing import Iterable

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


def opponent_name(engine: str | None, elo: int) -> str:
    """Display name for the engine opponent, e.g. "Maia 1300" / "Stockfish 1000"."""
    return f"{'Maia' if engine == 'maia' else 'Stockfish'} {elo}"


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
        opponent = opponent_name(db_game.engine, db_game.engine_elo)
        game_node.headers["White"] = "Player" if db_game.player_color == "white" else opponent
        game_node.headers["Black"] = opponent if db_game.player_color == "white" else "Player"
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


def win_percent(cp: float) -> float:
    """White's winning chances (0–100) for a White-POV centipawn eval.

    Same logistic model Lichess uses, so a 300cp swing matters a lot in an equal
    position but very little when one side is already completely winning.
    """
    return 50 + 50 * (2 / (1 + math.exp(-0.00368208 * cp)) - 1)


def mover_win_loss(eval_before: float, eval_after: float, mover_is_white: bool) -> float:
    """Win-percentage points the moving side gave up (never negative)."""
    before, after = win_percent(eval_before), win_percent(eval_after)
    lost = before - after if mover_is_white else after - before
    return max(0.0, lost)


def classify_move(win_loss: float) -> str:
    """Classify a move by win-percentage points lost (Lichess thresholds)."""
    if win_loss <= 0:
        return "best"
    elif win_loss < 5:
        return "good"
    elif win_loss < 10:
        return "inaccuracy"
    elif win_loss < 15:
        return "mistake"
    else:
        return "blunder"


# Per-move score used for "accuracy" everywhere (Home stats and Review panel).
ACCURACY_WEIGHTS = {"best": 100, "good": 85, "inaccuracy": 60, "mistake": 30, "blunder": 0}


def accuracy_summary(classifications: Iterable[str | None]) -> dict | None:
    """{pct, counts, n} over classified moves, or None if none are classified."""
    counts: dict[str, int] = {}
    for c in classifications:
        if c in ACCURACY_WEIGHTS:
            counts[c] = counts.get(c, 0) + 1
    n = sum(counts.values())
    if n == 0:
        return None
    total = sum(ACCURACY_WEIGHTS[c] * k for c, k in counts.items())
    return {"pct": round(total / n, 1), "counts": counts, "n": n}
