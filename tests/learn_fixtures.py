# tests/learn_fixtures.py
# A tiny corpus (one book section with a drill, three topics, a small puzzle DB) for Learn tests.
from pathlib import Path

import zstandard

from corpus_tools.book import build_book
from corpus_tools.puzzles import build_puzzle_db
from test_book import make_raw

TOPICS = '''
[[topic]]
slug = "knights"
title = "Knights"
group = "Pieces"
summary = "Jumpers."
ideas = ["Rim is dim."]
book = ["tiny:1"]
themes = ["fork"]

[[topic]]
slug = "forks"
title = "Forks"
group = "Tactics"
summary = "Double attacks."
themes = ["fork"]

[[topic]]
slug = "basic-mates"
title = "Basic checkmates"
group = "Endgames"
summary = "Mate the lone king."
book = ["tiny:1"]
'''

FEN_W = "r4rk1/pp3ppp/8/2bqp2b/3N4/P2Bn2P/1PPN1P2/R1BQ1RK1 w - - 1 15"   # White to move
FEN_B = "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24"           # Black to move
HEADER = "PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags,DailyDate\n"
ROWS = [  # id, fen, moves, rating, plays
    ("p1200", FEN_W, "d1h5 d5g2", 1200, 5000),
    ("p1250", FEN_W, "d1h5 d5g2", 1250, 5000),
    ("p1300", FEN_B, "f2g3 e6e7 b2b1 b3c1 b1c1 h6c1", 1300, 5000),
    ("p1350", FEN_W, "d1h5 d5g2", 1350, 5000),
    ("p1500", FEN_W, "d1h5 d5g2", 1500, 5000),
    ("p1700", FEN_W, "d1h5 d5g2", 1700, 5000),
]


def make_tiny_corpus(tmp_path: Path) -> Path:
    """tmp_path/{books/tiny, topics/topics.toml, puzzles/puzzles.sqlite}; returns tmp_path."""
    raw, books, spec = make_raw(tmp_path)
    build_book(spec, raw, books)
    (tmp_path / "topics").mkdir(exist_ok=True)
    (tmp_path / "topics/topics.toml").write_text(TOPICS)
    csv = HEADER + "".join(f"{i},{f},{m},{r},75,95,{p},fork short,u,,\n" for i, f, m, r, p in ROWS)
    dump = tmp_path / "p.csv.zst"
    dump.write_bytes(zstandard.ZstdCompressor().compress(csv.encode()))
    build_puzzle_db(dump, tmp_path / "puzzles/puzzles.sqlite")
    return tmp_path
