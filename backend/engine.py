import chess
import chess.engine
from typing import Optional
import shutil

STOCKFISH_PATH = shutil.which("stockfish") or "/home/ccollins/projects/chess/.venv/bin/stockfish"


class ChessEngine:
    """Wrapper around Stockfish for move generation and position evaluation."""

    def __init__(self, elo: int = 1500, stockfish_path: str = STOCKFISH_PATH, full_strength: bool = False):
        self._engine = chess.engine.SimpleEngine.popen_uci(stockfish_path)
        self.elo = elo
        if full_strength:
            self._engine.configure({"UCI_LimitStrength": False})
        else:
            self._set_elo(elo)

    # Approximate Skill Level (0-20) for ELOs below UCI_Elo minimum (1320).
    # Skill Level uses move randomisation, not calibrated ELO:
    #   Skill 0 ≈ 800, Skill 3 ≈ 1000, Skill 6 ≈ 1150, Skill 9 ≈ 1300
    _SKILL_BY_ELO = {800: 0, 1000: 3, 1150: 6, 1200: 6, 1300: 9}

    def _set_elo(self, elo: int):
        elo_option = self._engine.options.get("UCI_Elo")
        min_elo = (elo_option.min or 1320) if elo_option else 1320

        if elo < min_elo:
            skill = self._SKILL_BY_ELO.get(elo, 0)
            self._engine.configure({
                "UCI_LimitStrength": False,
                "Skill Level": skill,
            })
        else:
            self._engine.configure({
                "UCI_LimitStrength": True,
                "UCI_Elo": elo,
                "Skill Level": 20,   # reset skill level to max
            })

    def set_elo(self, elo: int):
        self.elo = elo
        self._set_elo(elo)

    def get_best_move(self, fen: str, time_limit: float = 0.1) -> str:
        board = chess.Board(fen)
        result = self._engine.play(board, chess.engine.Limit(time=time_limit))
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
        """Single Stockfish call returning (eval_cp_from_white, best_uci).

        Combines evaluate() + get_best_move() into one engine call.
        Returns best_uci=None for terminal positions (checkmate/stalemate).
        """
        board = chess.Board(fen)
        if board.is_game_over():
            outcome = board.outcome()
            if outcome and outcome.winner == chess.WHITE:
                return 10000.0, None
            if outcome and outcome.winner == chess.BLACK:
                return -10000.0, None
            return 0.0, None
        info = self._engine.analyse(board, chess.engine.Limit(time=time_limit))
        score = info["score"].white()
        if score.is_mate():
            ev = 10000.0 if score.mate() > 0 else -10000.0
        else:
            ev = float(score.cp)
        pv = info.get("pv", [])
        best = pv[0].uci() if pv else None
        return ev, best

    def close(self):
        self._engine.quit()
