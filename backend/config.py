# backend/config.py
import os

# ── CORS ──────────────────────────────────────────────────────────────────────
# Comma-separated origins via env var, or default to local dev ports
_cors_env = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:5174")
CORS_ORIGINS: list[str] = [o.strip() for o in _cors_env.split(",")]

# ── Stockfish time limits (seconds) ───────────────────────────────────────────
ENGINE_MOVE_TIME    = 0.1   # game engine: move generation + eval
HINT_TIME           = 0.3   # hint / best-move endpoints (full-strength engine)
ANALYSIS_TIME       = 0.1   # per-position time during post-game analysis
LIVE_EVAL_TIME      = 0.1   # full-strength eval shown after each move during play

# ── Game defaults ──────────────────────────────────────────────────────────────
DEFAULT_ENGINE_ELO  = 1500

# ── Maia (human-like opponent via lc0) ────────────────────────────────────────
MAIA_LEVELS: list[int] = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900]
MAIA_POLICY_FLOOR = 0.05   # only sample moves Maia gives at least this probability

# ── Learn area (corpus) ───────────────────────────────────────────────────────
from pathlib import Path as _Path
CORPUS_DIR = _Path(os.getenv("CORPUS_DIR", str(_Path(__file__).resolve().parent.parent / "corpus")))
PUZZLES_DB = _Path(os.getenv("PUZZLES_DB", str(CORPUS_DIR / "puzzles" / "puzzles.sqlite")))
