# backend/game_files.py
"""One human-readable PGN file per game: games/<public_id>.pgn.

Rewritten whenever the game changes (start, each move, takeback, resign,
analysis), so a game can be referenced by its ID mid-game or afterwards.
After analysis the file carries evals ([%eval]), quality NAGs (?! ? ??),
"Best was …" notes and both sides' accuracy.
"""
import logging
import os
import pathlib

import chess
import chess.pgn
from sqlalchemy.orm import Session

from .db import Game, Move
from .engine import MATE_CP
from .game_utils import accuracy_summary, opponent_name

log = logging.getLogger(__name__)

GAMES_DIR = pathlib.Path(os.getenv("GAMES_DIR") or pathlib.Path(__file__).resolve().parent.parent / "games")

_NAGS = {"inaccuracy": chess.pgn.NAG_DUBIOUS_MOVE, "mistake": chess.pgn.NAG_MISTAKE, "blunder": chess.pgn.NAG_BLUNDER}
_TERMINATION = {
    chess.Termination.CHECKMATE: "checkmate",
    chess.Termination.STALEMATE: "stalemate",
    chess.Termination.INSUFFICIENT_MATERIAL: "insufficient material",
    chess.Termination.THREEFOLD_REPETITION: "repetition",
    chess.Termination.FIVEFOLD_REPETITION: "repetition",
    chess.Termination.FIFTY_MOVES: "50-move rule",
    chess.Termination.SEVENTYFIVE_MOVES: "75-move rule",
}


def game_file_path(public_id: str) -> pathlib.Path:
    return pathlib.Path(GAMES_DIR) / f"{public_id}.pgn"


def _eval_tag(cp: float | None) -> str | None:
    """PGN [%eval] value (White POV, pawns; '#N' for mate). None if unknown/game over."""
    if cp is None or abs(cp) >= MATE_CP:
        return None
    if abs(cp) >= MATE_CP - 1000:          # backend encodes mate as ±(MATE_CP − moves)
        n = int(MATE_CP - abs(cp))
        return f"#{n}" if cp > 0 else f"#-{n}"
    return f"{cp / 100:.2f}"


def annotated_pgn(game_id: int, db: Session) -> str:
    game = db.get(Game, game_id)
    moves = db.query(Move).filter(Move.game_id == game_id).order_by(Move.ply).all()
    opponent = opponent_name(game.engine, game.engine_elo)

    root = chess.pgn.Game()
    h = root.headers
    h["Event"] = "Chess Trainer"
    h["Site"] = "Chess Trainer (local)"
    h["Date"] = game.played_at.strftime("%Y.%m.%d") if game.played_at else "????.??.??"
    h["Round"] = "-"
    h["White"] = "Player" if game.player_color == "white" else opponent
    h["Black"] = opponent if game.player_color == "white" else "Player"
    h["Result"] = game.result or "*"
    h["GameId"] = game.public_id or ""

    board = chess.Board()
    node = root
    for m in moves:
        mv = chess.Move.from_uci(m.uci)
        if mv not in board.legal_moves:
            break  # never write an invalid PGN
        node = node.add_variation(mv)
        if game.analyzed and m.classification:
            parts = []
            if m.classification in _NAGS:
                node.nags.add(_NAGS[m.classification])
                note = m.classification.capitalize() + "."
                if m.best_uci:
                    try:
                        note += f" Best was {board.san(chess.Move.from_uci(m.best_uci))}."
                    except (ValueError, AssertionError):
                        pass
                parts.append(note)
            tag = _eval_tag(m.eval_cp)
            if tag:
                parts.append(f"[%eval {tag}]")
            node.comment = " ".join(parts)
        board.push(mv)

    if board.is_game_over():
        h["Termination"] = _TERMINATION.get(board.outcome().termination, "normal")
    elif game.result and game.result != "*":
        h["Termination"] = f"{game.player_color.capitalize()} resigned"

    if game.analyzed:
        for side, is_white in (("White", True), ("Black", False)):
            acc = accuracy_summary(m.classification for m in moves if (m.ply % 2 == 1) == is_white)
            if acc:
                h[f"{side}Accuracy"] = f"{acc['pct']:.1f}"

    return root.accept(chess.pgn.StringExporter(headers=True, comments=True, variations=False))


def write_game_file(game_id: int, db: Session) -> None:
    """(Re)write games/<public_id>.pgn. Never raises: a file problem must not break play."""
    try:
        game = db.get(Game, game_id)
        if game is None or not game.public_id:
            return
        path = game_file_path(game.public_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".pgn.tmp")
        tmp.write_text(annotated_pgn(game_id, db) + "\n")
        tmp.replace(path)  # atomic: readers never see a half-written file
    except Exception:
        log.warning("Could not write game file for game %s", game_id, exc_info=True)


def delete_game_file(public_id: str | None) -> None:
    if not public_id:
        return
    try:
        game_file_path(public_id).unlink(missing_ok=True)
    except Exception:
        log.warning("Could not delete game file %s", public_id, exc_info=True)


def write_missing_game_files(db: Session) -> int:
    """Write files for games that don't have one yet (e.g. games from before
    game files existed). Returns how many were written."""
    written = 0
    for game_id, public_id in db.query(Game.id, Game.public_id).all():
        if public_id and not game_file_path(public_id).exists():
            write_game_file(game_id, db)
            written += 1
    return written
