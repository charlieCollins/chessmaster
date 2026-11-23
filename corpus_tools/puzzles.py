"""Lichess puzzle database (CC0) -> corpus/puzzles/puzzles.sqlite.

Lichess puzzle format: FEN is the position *before* the opponent's last move;
Moves[0] is that move, the solution is Moves[1:] (player, reply, player, ...).

Tables:
  puzzles(id PK, fen, moves, rating, rating_dev, popularity, plays, themes, game_url, openings)
  puzzle_themes(theme, rating, id)   -- one row per puzzle per theme; PK (theme, rating, id)
  themes(theme PK, count)
  meta(key PK, value)
"""
from __future__ import annotations

import csv
import io
import os
import random
import sqlite3
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import zstandard

SCHEMA = """
CREATE TABLE puzzles (
  id TEXT PRIMARY KEY, fen TEXT NOT NULL, moves TEXT NOT NULL,
  rating INTEGER NOT NULL, rating_dev INTEGER, popularity INTEGER, plays INTEGER,
  themes TEXT NOT NULL, game_url TEXT, openings TEXT
) WITHOUT ROWID;
CREATE TABLE puzzle_themes (
  theme TEXT NOT NULL, rating INTEGER NOT NULL, id TEXT NOT NULL,
  PRIMARY KEY (theme, rating, id)
) WITHOUT ROWID;
CREATE TABLE themes (theme TEXT PRIMARY KEY, count INTEGER NOT NULL);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
"""


def _rows(dump: Path):
    with open(dump, "rb") as fh:
        reader = zstandard.ZstdDecompressor().stream_reader(fh)
        for r in csv.DictReader(io.TextIOWrapper(reader, encoding="utf-8")):
            yield r


def build_puzzle_db(dump: Path, db_path: Path, batch: int = 50_000) -> int:
    """(Re)build the SQLite DB from the .csv.zst dump; returns the number of puzzles."""
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = db_path.with_suffix(".sqlite.tmp")
    if tmp.exists():
        tmp.unlink()
    con = sqlite3.connect(tmp)
    con.executescript("PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;" + SCHEMA)
    counts: Counter = Counter()
    n = 0
    pz, th = [], []

    def flush():
        con.executemany("INSERT INTO puzzles VALUES (?,?,?,?,?,?,?,?,?,?)", pz)
        con.executemany("INSERT INTO puzzle_themes VALUES (?,?,?)", th)
        pz.clear(); th.clear()

    for r in _rows(dump):
        rating = int(r["Rating"])
        themes = r["Themes"].split()
        pz.append((r["PuzzleId"], r["FEN"], r["Moves"], rating, int(r["RatingDeviation"]),
                   int(r["Popularity"]), int(r["NbPlays"]), r["Themes"], r["GameUrl"], r["OpeningTags"] or None))
        th.extend((t, rating, r["PuzzleId"]) for t in themes)
        counts.update(themes)
        n += 1
        if len(pz) >= batch:
            flush()
    flush()
    con.executemany("INSERT INTO themes VALUES (?,?)", sorted(counts.items()))
    con.executemany("INSERT INTO meta VALUES (?,?)", [
        ("source", str(dump.name)), ("puzzles", str(n)),
        ("built", datetime.now(timezone.utc).isoformat(timespec="seconds"))])
    con.commit()
    con.close()
    os.replace(tmp, db_path)
    return n


def puzzles_for_theme(db_path: Path, theme: str, min_rating: int, max_rating: int,
                      limit: int = 50, min_plays: int = 0, min_popularity: int = -100) -> list[dict]:
    """Puzzles tagged `theme` with min_rating <= rating <= max_rating, most-played first."""
    con = sqlite3.connect(db_path)
    try:
        cur = con.execute(
            """SELECT p.id, p.fen, p.moves, p.rating, p.popularity, p.plays, p.themes, p.game_url
               FROM puzzle_themes t JOIN puzzles p ON p.id = t.id
               WHERE t.theme = ? AND t.rating BETWEEN ? AND ? AND p.plays >= ? AND p.popularity >= ?
               ORDER BY p.plays DESC LIMIT ?""",
            (theme, min_rating, max_rating, min_plays, min_popularity, limit))
        return [{"id": i, "fen": f, "moves": m.split(), "rating": r, "popularity": pop, "plays": pl,
                 "themes": t.split(), "game_url": u} for i, f, m, r, pop, pl, t, u in cur]
    finally:
        con.close()


def write_puzzle_readme(db_path: Path, out: Path) -> None:
    """corpus/puzzles/README.md: what's in the DB, how to read a puzzle, every theme with its count."""
    con = sqlite3.connect(db_path)
    try:
        meta = dict(con.execute("SELECT key, value FROM meta"))
        themes = con.execute("SELECT theme, count FROM themes ORDER BY count DESC").fetchall()
    finally:
        con.close()
    md = [
        "# Puzzles — Lichess puzzle database (CC0)", "",
        f"`puzzles.sqlite` (git-ignored, ~2 GB) holds {int(meta['puzzles']):,} puzzles from real Lichess games, "
        f"built {meta['built']} from `corpus/raw/lichess/{meta['source']}` by "
        "`.venv/bin/python scripts/build_corpus.py puzzles` (~2 minutes).", "",
        "## Reading a puzzle", "",
        "`fen` is the position *before* the opponent's last move. Moves[0] is the opponent's move — play it "
        "first; the solution is Moves[1:] (your move, their reply, your move…), all in UCI. "
        "`rating` is the puzzle's Glicko rating; `popularity` (−100…100) and `plays` measure quality.", "",
        "## Tables", "",
        "```sql",
        SCHEMA.strip(),
        "```", "",
        "## Query", "",
        "```python",
        "from corpus_tools.puzzles import puzzles_for_theme",
        "puzzles_for_theme('corpus/puzzles/puzzles.sqlite', 'fork', 1200, 1500,",
        "                  limit=20, min_plays=1000, min_popularity=80)",
        "```", "",
        "## Themes", "",
        "| Theme | Puzzles |", "|---|---:|",
    ] + [f"| `{t}` | {c:,} |" for t, c in themes]
    Path(out).write_text("\n".join(md) + "\n")


_COLS = "p.id, p.fen, p.moves, p.rating, p.popularity, p.plays, p.themes, p.game_url"


def _row(r) -> dict:
    i, f, m, rating, pop, pl, t, u = r
    return {"id": i, "fen": f, "moves": m.split(), "rating": rating, "popularity": pop, "plays": pl,
            "themes": t.split(), "game_url": u}


_ID_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"


def select_puzzles(db_path: Path, themes: list[str], rating: float, n: int, exclude: set[str],
                   band: int = 150, max_band: int = 300, min_plays: int = 1000, min_popularity: int = 80,
                   rng: random.Random | None = None) -> list[dict]:
    """Up to n random quality puzzles tagged with any of `themes` within rating ± band
    (± max_band if that finds fewer than n), skipping ids in `exclude`.

    Random index seeks instead of ORDER BY random(): pick a theme, a rating and an id
    prefix at random, take the next row in the (theme, rating, id) index, then check
    the quality floor — milliseconds even for themes with a million puzzles."""
    if not themes or n <= 0:
        return []
    rng = rng or random.Random()
    con = sqlite3.connect(db_path)
    try:
        chosen: dict[str, dict] = {}
        for width in (band, max_band):
            lo, hi = int(rating - width), int(rating + width)
            for _ in range(n * 60):
                if len(chosen) >= n:
                    break
                theme = rng.choice(themes)
                start_id = "".join(rng.choice(_ID_CHARS) for _ in range(3))
                # Quality floor inside the seek, so a low-quality or excluded row
                # can't shadow the good puzzles right behind it in the index.
                rows = con.execute(
                    f"""SELECT {_COLS} FROM puzzle_themes t JOIN puzzles p ON p.id = t.id
                        WHERE t.theme = ? AND (t.rating, t.id) >= (?, ?) AND t.rating <= ?
                          AND p.plays >= ? AND p.popularity >= ?
                        ORDER BY t.rating, t.id LIMIT ?""",
                    (theme, rng.randint(lo, hi), start_id, hi, min_plays, min_popularity,
                     len(exclude) + len(chosen) + 1)).fetchall()
                r = next((r for r in rows if r[0] not in exclude and r[0] not in chosen), None)
                if r:
                    chosen[r[0]] = _row(r)
            if len(chosen) >= n:
                break
    finally:
        con.close()
    out = list(chosen.values())
    rng.shuffle(out)
    return out


def get_puzzle(db_path: Path, puzzle_id: str) -> dict | None:
    con = sqlite3.connect(db_path)
    try:
        r = con.execute(f"SELECT {_COLS} FROM puzzles p WHERE p.id = ?", (puzzle_id,)).fetchone()
    finally:
        con.close()
    return _row(r) if r else None
