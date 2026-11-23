# tests/conftest.py
# Loaded before any test module: keep per-game PGN files out of the real games/ dir.
import os
import tempfile

os.environ["GAMES_DIR"] = tempfile.mkdtemp(prefix="chess-test-games-")
