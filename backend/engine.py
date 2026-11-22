import chess
import chess.engine
from typing import Optional
import shutil
import os

STOCKFISH_PATH = shutil.which("stockfish") or os.getenv("STOCKFISH_PATH", "stockfish")

# Sorted list of (elo, skill_level) pairs for interpolation.
# Maps ELOs below UCI_Elo minimum (~1320) to Stockfish Skill Level (0-20).
_SKILL_BY_ELO = sorted({1000: 0, 1100: 3, 1200: 6, 1300: 9}.items())

# Depth per Skill Level — matches Lichess's approach (all weak levels use depth 5).
# Depth 1 is counterproductive: at depth=1 only material is evaluated so all
# reasonable moves look the same, defeating Skill Level randomisation.
# Depth 5 gives Stockfish enough lookahead to form candidate moves, then Skill
# Level picks a suboptimal one — producing more realistic human-like errors.
#   Lichess levels 1-5 (all weak bots): depth 5
#   Lichess level 6 (~1900): depth 8
#   With standard Stockfish Skill Level 0 ≈ ~1000–1100 ELO (Lichess Level 3-4)
_DEPTH_BY_SKILL = {0: 5, 3: 5, 6: 8, 9: 13}


def _elo_to_skill(elo: int) -> int:
    """Return the nearest-or-lower Skill Level for the given ELO via sorted lookup."""
    for e, s in _SKILL_BY_ELO:
        if elo <= e:
            return s
    return _SKILL_BY_ELO[-1][1]


class ChessEngine:
    """Wrapper around Stockfish for move generation and position evaluation."""

    def __init__(self, elo: int = 1500, stockfish_path: str = STOCKFISH_PATH, full_strength: bool = False):
        try:
            self._engine = chess.engine.SimpleEngine.popen_uci(stockfish_path)
        except Exception as e:
            raise RuntimeError(
                f"Failed to start Stockfish engine: {e}. Make sure stockfish is installed."
            ) from e
        self.elo = elo
        self._depth_limit: int | None = None
        if full_strength:
            self._engine.configure({"UCI_LimitStrength": False})
        else:
            self._set_elo(elo)

    # Approximate Skill Level (0-20) for ELOs below UCI_Elo minimum (1320).
    # Skill Level uses move randomisation, not calibrated ELO:
    #   Skill 0 ≈ 800, Skill 3 ≈ 1000, Skill 6 ≈ 1150, Skill 9 ≈ 1300

    def _set_elo(self, elo: int):
        elo_option = self._engine.options.get("UCI_Elo")
        min_elo = (elo_option.min or 1320) if elo_option else 1320

        if elo < min_elo:
            skill = _elo_to_skill(elo)
            self._engine.configure({
                "UCI_LimitStrength": False,
                "Skill Level": skill,
            })
            self._depth_limit = _DEPTH_BY_SKILL.get(skill, 3)
        else:
            self._engine.configure({
                "UCI_LimitStrength": True,
                "UCI_Elo": elo,
                "Skill Level": 20,   # reset skill level to max
            })
            self._depth_limit = None

    def set_elo(self, elo: int):
        self.elo = elo
        self._set_elo(elo)

    def _limit(self, time_limit: float) -> chess.engine.Limit:
        """Return a Limit with an optional depth cap for skill-level modes."""
        if self._depth_limit is not None:
            return chess.engine.Limit(time=time_limit, depth=self._depth_limit)
        return chess.engine.Limit(time=time_limit)

    def get_best_move(self, fen: str, time_limit: float = 0.1) -> Optional[str]:
        board = chess.Board(fen)
        result = self._engine.play(board, self._limit(time_limit))
        if result.move is None:
            return None
        return result.move.uci()

    def evaluate(self, fen: str, time_limit: float = 0.1) -> Optional[float]:
        """Return centipawn evaluation from White's perspective. Mate = +-10000."""
        board = chess.Board(fen)
        info = self._engine.analyse(board, chess.engine.Limit(time=time_limit))
        score = info["score"].white()
        if score.is_mate():
            return 10000.0 if score.mate() > 0 else -10000.0
        return float(score.cp)

    def analyse_position(self, fen: str, time_limit: float = 0.1) -> tuple[float, Optional[str]]:
        """Single Stockfish call returning (eval_cp_from_white, chosen_uci).

        Uses play() so Skill Level degradation is applied to move selection.
        analyse() always returns the objectively best move and ignores Skill Level.
        Returns chosen_uci=None for terminal positions (checkmate/stalemate).
        """
        board = chess.Board(fen)
        if board.is_game_over():
            outcome = board.outcome()
            if outcome and outcome.winner == chess.WHITE:
                return 10000.0, None
            if outcome and outcome.winner == chess.BLACK:
                return -10000.0, None
            return 0.0, None
        result = self._engine.play(board, self._limit(time_limit), info=chess.engine.INFO_SCORE)
        if result.move is None:
            return 0.0, None
        score_obj = result.info.get("score")
        if score_obj is not None:
            score = score_obj.white()
            ev = (10000.0 if score.mate() > 0 else -10000.0) if score.is_mate() else float(score.cp)
        else:
            # Fallback: score not in play() info — do a quick separate analyse call
            info = self._engine.analyse(board, chess.engine.Limit(time=time_limit))
            score = info["score"].white()
            ev = (10000.0 if score.mate() > 0 else -10000.0) if score.is_mate() else float(score.cp)
        return ev, result.move.uci()

    def close(self):
        self._engine.quit()
