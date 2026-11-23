#!/usr/bin/env python3
"""Build the derived corpus from corpus/raw/ (see corpus/README.md).

  .venv/bin/python scripts/build_corpus.py            # books + topic pages
  .venv/bin/python scripts/build_corpus.py puzzles    # also (re)build the Lichess puzzle DB (~2 min, 2 GB)
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
    db = ROOT / "corpus" / "puzzles" / "puzzles.sqlite"
    if db.exists():
        from corpus_tools.puzzles import write_puzzle_readme
        write_puzzle_readme(db, db.parent / "README.md")
    topics = build_topics(ROOT / "corpus")
    print(f"topics: {len(topics)} pages")


if __name__ == "__main__":
    main(sys.argv[1:])
