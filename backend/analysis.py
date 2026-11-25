# backend/analysis.py
import chess
from sqlalchemy.orm import Session
from .db import Move, Game
from .engine import ChessEngine
from .game_utils import classify_move, mover_win_loss
from .config import ANALYSIS_TIME


def _own_engine(fn):
    """Run fn on a fresh full-strength Stockfish (for scripts and tests; the app passes its shared engine)."""
    eng = ChessEngine(full_strength=True)
    try:
        return fn(eng)
    finally:
        eng.close()


def analyze_game(game_id: int, db: Session, run_engine=None) -> None:
    """
    Run full post-game analysis.

    Strategy: collect all N+1 FEN positions up front (no engine calls), then
    call analyse_position() exactly once per position.  Each single call returns
    both the centipawn eval AND the best move.

    `run_engine(fn)` runs fn(engine) on a full-strength engine. The app passes its shared,
    lock-guarded hint engine: each Stockfish is ~180 MB, and starting one per analysis ran
    the server out of memory when two analyses overlapped.
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
        try:
            board.push(chess.Move.from_uci(m.uci))
        except (ValueError, chess.InvalidMoveError):
            # Skip bad moves — don't crash the whole analysis
            continue
        fens.append(board.fen())
    # fens[i]   = position before move i  (eval_before for move i)
    # fens[i+1] = position after  move i  (eval_after  for move i)

    # ── Step 2: analyse each position once ──────────────────────────────────
    def evaluate_all(eng) -> tuple[list[float], list[str | None]]:
        evals: list[float] = []           # evals[i] = cp eval of fens[i]
        best_ucis: list[str | None] = []  # best_ucis[i] = best move from fens[i]
        for fen in fens:
            ev, best = eng.analyse_position(fen, time_limit=ANALYSIS_TIME)
            evals.append(ev)
            best_ucis.append(best)
        return evals, best_ucis

    evals, best_ucis = (run_engine or _own_engine)(evaluate_all)

    # ── Step 3: classify each move ───────────────────────────────────────────
    # fens may be shorter than moves if any UCI was invalid (step 1 skips bad ones)
    for i, move_record in enumerate(moves):
        if i + 1 >= len(evals):
            break  # no eval pair available for this move; skip remaining
        eval_before = evals[i]
        eval_after  = evals[i + 1]

        # Odd ply = White moved; even ply = Black moved.
        mover_is_white = move_record.ply % 2 == 1
        cp_loss = eval_before - eval_after if mover_is_white else eval_after - eval_before

        if move_record.uci == best_ucis[i]:
            classification = "best"   # played the engine's choice; ignore eval noise
        else:
            classification = classify_move(mover_win_loss(eval_before, eval_after, mover_is_white))

        move_record.eval_cp         = eval_after
        move_record.best_uci        = best_ucis[i]
        move_record.eval_loss_cp    = max(0, min(cp_loss, 2000))  # raw cp, kept for reference
        move_record.classification  = classification

    game = db.get(Game, game_id)
    if game is None:
        return  # game was deleted during analysis
    game.analyzed = 1
    db.commit()
