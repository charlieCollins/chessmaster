# tests/test_learn_content.py
from pathlib import Path

from learn_fixtures import make_tiny_corpus
from backend.learn_content import load_corpus, topic_summaries, topic_detail, find_drill, PIECE_LESSONS

FIG1 = "8/p6p/4k3/8/4K3/8/P5PP/8 w - - 0 1"


def test_summaries_in_spec_order_with_flags(tmp_path):
    c = load_corpus(make_tiny_corpus(tmp_path))
    s = topic_summaries(c)
    assert [t["slug"] for t in s] == ["knights", "forks", "basic-mates"]
    by = {t["slug"]: t for t in s}
    assert by["knights"]["has_drills"] and by["knights"]["has_puzzles"]
    assert not by["forks"]["has_drills"] and by["forks"]["has_puzzles"]
    assert by["basic-mates"]["has_drills"] and not by["basic-mates"]["has_puzzles"]
    assert by["knights"]["group"] == "Pieces" and by["knights"]["summary"] == "Jumpers."


def test_detail_has_sections_and_drills(tmp_path):
    d = topic_detail(load_corpus(make_tiny_corpus(tmp_path)), "knights")
    assert d["ideas"] == ["Rim is dim."] and d["themes"] == ["fork"]
    sec = d["sections"][0]
    assert sec["book_title"] == "Tiny Chess" and sec["section"] == "1" and sec["title"] == "Pawn Endings"
    assert {"kind": "diagram", "fig": "Fig1"} in sec["blocks"]
    drill = d["drills"][0]
    assert drill["ref"] == "tiny:Fig1" and drill["fen"] == FIG1 and drill["topic"] == "knights"
    assert drill["line_uci"] == ["g2g4", "a7a5"] and drill["ask_moves"] == 1
    assert d["diagrams"]["Fig1"]["fen"] == FIG1      # for rendering the Read step


def test_piece_lesson_flag(tmp_path):
    c = load_corpus(make_tiny_corpus(tmp_path))
    assert topic_detail(c, "knights")["piece_lesson"] is True
    assert topic_detail(c, "forks")["piece_lesson"] is False
    assert "knights" in PIECE_LESSONS


def test_unknown_topic_is_none(tmp_path):
    assert topic_detail(load_corpus(make_tiny_corpus(tmp_path)), "nope") is None


def test_find_drill_by_ref(tmp_path):
    c = load_corpus(make_tiny_corpus(tmp_path))
    assert find_drill(c, "tiny:Fig1")["line_san"] == ["g4", "a5"]
    assert find_drill(c, "tiny:Fig99") is None


def test_real_corpus_loads():
    c = load_corpus(Path(__file__).resolve().parent.parent / "corpus")
    assert len(topic_summaries(c)) == 23
    assert topic_detail(c, "knights")["drills"]
