# backend/analysis.py
import chess
from sqlalchemy.orm import Session
from .db import Move, Game
from .engine import ChessEngine
from .game_utils import classify_move


def analyze_game(game_id: int, db: Session) -> None:
    """
    Run full post-game analysis. For each ply:
    - Get eval before the move (from White's POV)
    - Get Stockfish's best move at that position
    - Make the actual move
    - Get eval after the move (from White's POV)
    - Compute eval loss from the moving player's perspective
    - Classify and store result
    """
    moves = (
        db.query(Move)
        .filter(Move.game_id == game_id)
        .order_by(Move.ply)
        .all()
    )
    if not moves:
        return

    eng = ChessEngine(elo=3190)  # full strength for analysis
    try:
        board = chess.Board()
        for move_record in moves:
            eval_before = eng.evaluate(board.fen(), time_limit=0.3) or 0.0
            best_uci = eng.get_best_move(board.fen(), time_limit=0.3)

            actual_move = chess.Move.from_uci(move_record.uci)
            board.push(actual_move)

            eval_after = eng.evaluate(board.fen(), time_limit=0.3) or 0.0

            # Odd ply = White moved; even ply = Black moved
            # White wants eval_after to be higher (more positive)
            # Black wants eval_after to be lower (more negative)
            if move_record.ply % 2 == 1:  # White's move
                eval_loss = eval_before - eval_after
            else:                          # Black's move
                eval_loss = eval_after - eval_before

            move_record.eval_cp = eval_after
            move_record.best_uci = best_uci
            move_record.eval_loss_cp = eval_loss
            move_record.classification = classify_move(eval_loss)

        game = db.get(Game, game_id)
        game.analyzed = 1
        db.commit()
    finally:
        eng.close()
