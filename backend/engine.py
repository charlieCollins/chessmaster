import chess
import chess.engine
from typing import Optional
import shutil

STOCKFISH_PATH = shutil.which("stockfish") or "/home/ccollins/projects/chess/.venv/bin/stockfish"


class ChessEngine:
    """Wrapper around Stockfish for move generation and position evaluation."""

    def __init__(self, elo: int = 1500, stockfish_path: str = STOCKFISH_PATH):
        self._engine = chess.engine.SimpleEngine.popen_uci(stockfish_path)
        self.elo = elo
        self._set_elo(elo)

    def _set_elo(self, elo: int):
        self._engine.configure({"UCI_LimitStrength": True, "UCI_Elo": elo})

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

    def close(self):
        self._engine.quit()
