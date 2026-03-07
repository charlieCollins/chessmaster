# backend/analysis.py
import chess
from sqlalchemy.orm import Session
from .db import Move, Game
from .engine import ChessEngine
from .game_utils import classify_move
from .config import ANALYSIS_TIME


def analyze_game(game_id: int, db: Session) -> None:
    """
    Run full post-game analysis.

    Strategy: collect all N+1 FEN positions up front (no engine calls), then
    call analyse_position() exactly once per position.  Each single call returns
    both the centipawn eval AND the best move, so we never evaluate the same
    position twice and never make separate eval/best-move calls.

    Old approach: 3 calls × 0.3 s × N moves  ≈ 36 s for a 40-move game.
    New approach: 1 call × 0.1 s × (N+1) positions ≈  4 s for a 40-move game.
    """
    moves = (
        db.query(Move)
        .filter(Move.game_id == game_id)
        .order_by(Move.ply)
        .all()
    )
    if not moves:
        return

    # ── Step 1: replay moves to collect every FEN position ──────────────────
    board = chess.Board()
    fens: list[str] = [board.fen()]          # fens[0] = starting position
    for m in moves:
        board.push(chess.Move.from_uci(m.uci))
        fens.append(board.fen())
    # fens[i]   = position before move i  (eval_before for move i)
    # fens[i+1] = position after  move i  (eval_after  for move i)

    # ── Step 2: analyse each position once ──────────────────────────────────
    eng = ChessEngine(full_strength=True)
    try:
        evals: list[float] = []      # evals[i] = cp eval of fens[i]
        best_ucis: list[str | None] = []  # best_ucis[i] = best move from fens[i]

        for fen in fens:
            ev, best = eng.analyse_position(fen, time_limit=ANALYSIS_TIME)
            evals.append(ev)
            best_ucis.append(best)

        # ── Step 3: classify each move ───────────────────────────────────────
        for i, move_record in enumerate(moves):
            eval_before = evals[i]
            eval_after  = evals[i + 1]

            # Odd ply = White moved; even ply = Black moved.
            # eval_loss is positive when the player made a worse move.
            if move_record.ply % 2 == 1:   # White's move
                eval_loss = eval_before - eval_after
            else:                           # Black's move
                eval_loss = eval_after - eval_before

            move_record.eval_cp         = eval_after
            move_record.best_uci        = best_ucis[i]
            move_record.eval_loss_cp    = eval_loss
            move_record.classification  = classify_move(eval_loss)

        game = db.get(Game, game_id)
        game.analyzed = 1
        db.commit()
    finally:
        eng.close()
