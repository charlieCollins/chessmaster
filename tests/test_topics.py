# tests/test_topics.py
# corpus/topics/*.md generated from topics.toml + book section index + puzzle DB.
import zstandard

from corpus_tools.puzzles import build_puzzle_db
from corpus_tools.topics import build_topics

TOML = '''
[[topic]]
slug = "knights"
title = "Knights"
group = "Pieces"
summary = "Short-range jumpers."
ideas = ["Knights on the rim are dim.", "Forks win material."]
book = ["tiny:1"]
themes = ["fork"]
app = "Learn → Knights"
'''

CSV = """PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags,DailyDate
a,8/8/8/8/8/8/8/K6k w - - 0 1,a1a2 h1h2,1300,75,95,5000,fork short,u,,
b,8/8/8/8/8/8/8/K6k w - - 0 1,a1a2 h1h2,1350,75,95,10,fork short,u,,
c,8/8/8/8/8/8/8/K6k w - - 0 1,a1a2 h1h2,1900,75,95,5000,fork short,u,,
"""


def setup(tmp_path):
    corpus = tmp_path / "corpus"
    (corpus / "topics").mkdir(parents=True)
    (corpus / "topics/topics.toml").write_text(TOML)
    book = corpus / "books/tiny"
    book.mkdir(parents=True)
    (book / "README.md").write_text("# Tiny Chess — A. Author (1920)\n")
    (book / "sections.tsv").write_text("section\ttitle\tfile\tanchor\tdiagrams\n"
                                       "1\tPawn Endings\t01-ch.md\t#1-pawn-endings\tFig1,Fig2\n")
    dump = tmp_path / "p.csv.zst"
    dump.write_bytes(zstandard.ZstdCompressor().compress(CSV.encode()))
    build_puzzle_db(dump, corpus / "puzzles/puzzles.sqlite")
    return corpus


def test_topic_page_links_book_sections_and_counts_puzzles(tmp_path):
    corpus = setup(tmp_path)
    build_topics(corpus)
    md = (corpus / "topics/knights.md").read_text()
    assert md.startswith("# Knights")
    assert "- Knights on the rim are dim." in md
    assert "[1. Pawn Endings](../books/tiny/01-ch.md#1-pawn-endings) — diagrams 1, 2" in md
    assert "*Tiny Chess* (A. Author)" in md
    # all / quality (plays >= 1000, popularity >= 80) per rating band
    assert "| `fork` | 3 | 0 | 1 | 1 |" in md
    assert "Learn → Knights" in md


def test_index_lists_topics_by_group(tmp_path):
    corpus = setup(tmp_path)
    build_topics(corpus)
    idx = (corpus / "topics/README.md").read_text()
    assert "## Pieces" in idx and "- [Knights](knights.md) — Short-range jumpers." in idx
