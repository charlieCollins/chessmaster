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

# ── Game defaults ──────────────────────────────────────────────────────────────
DEFAULT_ENGINE_ELO  = 1500
