#!/usr/bin/env python3
"""Build the derived corpus from corpus/raw/ (see corpus/README.md).

  .venv/bin/python scripts/build_corpus.py            # books + topic pages
  .venv/bin/python scripts/build_corpus.py puzzles    # also (re)build the Lichess puzzle DB (~2 min, 2 GB)
  .venv/bin/python scripts/build_corpus.py puzzles-lite   # server-sized subset (deploy/deploy.sh ships it)
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from corpus_tools.book import BookSpec, build_book  # noqa: E402
from corpus_tools.topics import build_topics  # noqa: E402

RAW = ROOT / "corpus" / "raw"
BOOKS = ROOT / "corpus" / "books"

CAPABLANCA = BookSpec(
    slug="capablanca-chess-fundamentals", title="Chess Fundamentals", author="José Raúl Capablanca",
    year=1921, gutenberg_id=33870, html_zip="gutenberg/33870/33870-h.zip", html_member="33870-h/33870-h.htm")


def build_puzzles_lite(chess_db: Path = ROOT / "chess.db") -> int:
    """Server-sized puzzle DB (~50 MB): top puzzles per theme/rating band, plus every puzzle
    the local chess.db history refers to (so copied review items still resolve)."""
    import sqlite3
    from corpus_tools.puzzles import export_subset
    keep: set[str] = set()
    if chess_db.exists():
        con = sqlite3.connect(chess_db)
        try:
            for table in ("learn_attempts", "learn_reviews"):
                try:
                    keep |= {r[0] for r in con.execute(f"SELECT ref FROM {table} WHERE kind = 'puzzle'")}
                except sqlite3.OperationalError:
                    pass          # table not created yet
        finally:
            con.close()
    return export_subset(ROOT / "corpus" / "puzzles" / "puzzles.sqlite",
                         ROOT / "corpus" / "puzzles" / "puzzles-lite.sqlite", include_ids=keep)


def main(argv):
    rep = build_book(CAPABLANCA, RAW, BOOKS)
    diag = rep["diagrams"]
    checked = sum(1 for d in diag.values() if d.get("checked_moves"))
    print(f"{CAPABLANCA.slug}: {len(rep['chapters'])} chapters, {len(rep['games'])} games, "
          f"{len(diag)} diagrams ({checked} confirmed by replaying book moves)")
    for num, g in rep["games"].items():
        flag = "" if g["moves"] == g["of"] else f"  ({g['moves']}/{g['of']} moves read: {g['error']})"
        print(f"  game {num:>2}: {g['white']} – {g['black']} {g['result']}{flag}")
    if "puzzles" in argv:
        from corpus_tools.puzzles import build_puzzle_db
        n = build_puzzle_db(RAW / "lichess" / "lichess_db_puzzle.csv.zst", ROOT / "corpus" / "puzzles" / "puzzles.sqlite")
        print(f"puzzles: {n} rows")
    if "puzzles-lite" in argv:
        n = build_puzzles_lite()
        print(f"puzzles-lite: {n} puzzles → corpus/puzzles/puzzles-lite.sqlite")
    db = ROOT / "corpus" / "puzzles" / "puzzles.sqlite"
    if db.exists():
        from corpus_tools.puzzles import write_puzzle_readme
        write_puzzle_readme(db, db.parent / "README.md")
    topics = build_topics(ROOT / "corpus")
    print(f"topics: {len(topics)} pages")


if __name__ == "__main__":
    main(sys.argv[1:])
