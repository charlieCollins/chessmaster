import chess
import chess.engine
from typing import Callable, Optional, TypeVar
import shutil
import os
import pathlib
import random
import re
import threading

from .config import MAIA_LEVELS, MAIA_POLICY_FLOOR

# Explicit env var wins; otherwise whatever `stockfish` is on PATH.
STOCKFISH_PATH = os.getenv("STOCKFISH_PATH") or shutil.which("stockfish") or "stockfish"

MATE_CP = 10000  # centipawn value used to represent a forced mate

T = TypeVar("T")


def _white_cp(score: chess.engine.PovScore) -> float:
    """Centipawns from White's POV; mates map to ±MATE_CP (minus distance to mate)."""
    return float(score.white().score(mate_score=MATE_CP))


def _as_board(position: "str | chess.Board") -> chess.Board:
    """A private Board for a FEN or a Board (a Board keeps its move history,
    which lets engines see repetitions and lets Maia's network read recent moves)."""
    return position.copy() if isinstance(position, chess.Board) else chess.Board(position)


def terminal_eval(board: chess.Board) -> float:
    """Eval for a finished game: ±MATE_CP for checkmate, 0 for any draw."""
    outcome = board.outcome()
    if outcome is None or outcome.winner is None:
        return 0.0
    return MATE_CP if outcome.winner == chess.WHITE else -MATE_CP

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

    def get_best_move(self, position: "str | chess.Board", time_limit: float = 0.1) -> Optional[str]:
        board = _as_board(position)
        result = self._engine.play(board, self._limit(time_limit))
        if result.move is None:
            return None
        return result.move.uci()

    def evaluate(self, fen: str, time_limit: float = 0.1) -> float:
        """Return centipawn evaluation from White's perspective. Mate = ±MATE_CP."""
        board = chess.Board(fen)
        if board.is_game_over():
            return terminal_eval(board)
        info = self._engine.analyse(board, chess.engine.Limit(time=time_limit))
        return _white_cp(info["score"])

    def analyse_position(self, fen: str, time_limit: float = 0.1) -> tuple[float, Optional[str]]:
        """Single Stockfish call returning (eval_cp_from_white, chosen_uci).

        Uses play() so Skill Level degradation is applied to move selection.
        analyse() always returns the objectively best move and ignores Skill Level.
        Returns chosen_uci=None for terminal positions (checkmate/stalemate).
        """
        board = chess.Board(fen)
        if board.is_game_over():
            return terminal_eval(board), None
        result = self._engine.play(board, self._limit(time_limit), info=chess.engine.INFO_SCORE)
        if result.move is None:
            return 0.0, None
        score = result.info.get("score")
        if score is None:
            # Fallback: score not in play() info — do a quick separate analyse call
            score = self._engine.analyse(board, chess.engine.Limit(time=time_limit))["score"]
        return _white_cp(score), result.move.uci()

    def close(self):
        self._engine.quit()


# ── Maia (human-trained nets run by lc0) ─────────────────────────────────────
LC0_PATH: str | None = os.getenv("LC0_PATH") or shutil.which("lc0")
MAIA_WEIGHTS_DIR = pathlib.Path(os.getenv("MAIA_WEIGHTS_DIR") or "~/.local/share/maia").expanduser()

_POLICY_LINE = re.compile(r"^(\S+)\s.*\(P:\s*([\d.]+)%\)")


def _weights_file(level: int) -> pathlib.Path:
    return MAIA_WEIGHTS_DIR / f"maia-{level}.pb.gz"


def maia_available() -> bool:
    """True if lc0 can be found and every Maia weights file is present."""
    return bool(LC0_PATH) and all(_weights_file(lv).is_file() for lv in MAIA_LEVELS)


def parse_policy(info_strings: list[str]) -> dict[str, float]:
    """Parse lc0 VerboseMoveStats lines into {uci: probability 0–1}."""
    policy: dict[str, float] = {}
    for line in info_strings:
        m = _POLICY_LINE.match(line.strip())
        if not m:
            continue
        try:
            chess.Move.from_uci(m.group(1))  # skips the "node" summary line etc.
        except (ValueError, chess.InvalidMoveError):
            continue
        policy[m.group(1)] = float(m.group(2)) / 100
    return policy


def choose_from_policy(board: chess.Board, policy: dict[str, float], rng: random.Random) -> str | None:
    """Sample a legal move among those Maia rates >= MAIA_POLICY_FLOOR, weighted by
    probability; else the most likely legal move; None if no legal move is listed."""
    # Normalise to standard UCI via the board: lc0 reports castling as
    # king-takes-rook (e1h1), which parse_uci maps to e1g1. Illegal/garbage → skipped.
    candidates: dict[str, float] = {}
    for u, p in policy.items():
        try:
            move = board.parse_uci(u)
        except ValueError:
            continue
        candidates[move.uci()] = candidates.get(move.uci(), 0.0) + p
    if not candidates:
        return None
    likely = {u: p for u, p in candidates.items() if p >= MAIA_POLICY_FLOOR}
    if not likely:
        return max(candidates, key=candidates.get)
    moves = list(likely)
    return rng.choices(moves, weights=[likely[u] for u in moves])[0]


class MaiaEngine:
    """Human-like opponent: a Maia net in lc0, playing from its policy at 1 node.

    No search on purpose — Maia's first instinct is what imitates human play.
    """

    def __init__(self, level: int = 1300, rng: random.Random | None = None):
        if not LC0_PATH:
            raise RuntimeError("lc0 not found (set LC0_PATH or put lc0 on PATH)")
        if level not in MAIA_LEVELS:
            raise ValueError(f"Maia level must be one of {MAIA_LEVELS}")
        self._rng = rng or random.Random()
        self._engine = chess.engine.SimpleEngine.popen_uci(
            [LC0_PATH, f"--weights={_weights_file(level)}", "--threads=1"],
            stderr=open(os.devnull, "w"),
        )
        # Raw policy (lc0 defaults to a flattening temperature of 1.359), so we
        # sample Maia's actual human-move probabilities.
        self._engine.configure({"VerboseMoveStats": True, "PolicyTemperature": 1.0})
        self.level = level
        # python-chess sends `ucinewgame` whenever this token changes; lc0 clears
        # its cache of network results on ucinewgame, which a weights switch needs.
        self._game = object()

    def set_level(self, level: int) -> None:
        if level not in MAIA_LEVELS:
            raise ValueError(f"Maia level must be one of {MAIA_LEVELS}")
        if level != self.level:
            self._engine.configure({"WeightsFile": str(_weights_file(level))})
            self.level = level
            self._game = object()  # drop results cached from the previous net

    def policy(self, position: "str | chess.Board") -> dict[str, float]:
        """Maia's move probabilities ({uci: 0–1}); empty if unreadable.
        Pass a Board with its move history when you have one — Maia's network
        uses recent moves, and a bare FEN distorts its policy badly."""
        strings: list[str] = []
        with self._engine.analysis(_as_board(position), chess.engine.Limit(nodes=1), game=self._game) as analysis:
            for info in analysis:
                if "string" in info:
                    strings.append(info["string"])
        return parse_policy(strings)

    def get_best_move(self, position: "str | chess.Board", time_limit: float = 0.1) -> Optional[str]:
        """Pick Maia's move. `time_limit` is ignored (always 1 node)."""
        board = _as_board(position)
        if board.is_game_over():
            return None
        move = choose_from_policy(board, self.policy(board), self._rng)
        if move is None:
            played = self._engine.play(board, chess.engine.Limit(nodes=1), game=self._game).move
            move = played.uci() if played else None
        return move

    def close(self) -> None:
        self._engine.quit()


class EngineSlot:
    """A lazily started, lock-guarded ChessEngine that survives Stockfish crashes.

    If Stockfish dies mid-call (e.g. segfault on a malformed position), the dead
    process is discarded and the call is retried once on a fresh engine, so one
    bad request can't take the endpoint down until the server restarts.
    """

    def __init__(self, factory: Callable[[], ChessEngine]):
        self._factory = factory
        self._engine: ChessEngine | None = None
        self._lock = threading.Lock()

    def run(self, fn: Callable[[ChessEngine], T]) -> T:
        with self._lock:
            for attempt in range(2):
                if self._engine is None:
                    self._engine = self._factory()
                try:
                    return fn(self._engine)
                except chess.engine.EngineTerminatedError:
                    self._discard()
                    if attempt == 1:
                        raise
            raise AssertionError("unreachable")

    def _discard(self) -> None:
        eng, self._engine = self._engine, None
        if eng is not None:
            try:
                eng.close()
            except Exception:
                pass  # process is already dead

    def close(self) -> None:
        with self._lock:
            self._discard()
