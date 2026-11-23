# tests/test_book.py
# Building a corpus book (markdown chapters, game files, PGN) from Gutenberg HTML.
import io
import zipfile

import chess
import pytest

from corpus_tools.book import BookSpec, build_book, game_result, DiagramMismatch

HTML = """<html><body>
<h1>TINY CHESS</h1>
<h3>PREFACE</h3><p>Read this.</p>
<h3>PART I</h3>
<h3>CHAPTER I</h3>
<p class="cenhead">First Principles</p>
<p class="cenhead">1. PAWN ENDINGS</p>
<p><b>Example 1.</b>&mdash;White to play.</p>
<div class="figcenter"><img src="images/Fig1.jpg" alt="" /></div>
<p class="cenhead">1.&nbsp;P&nbsp;-&nbsp;K&nbsp;Kt&nbsp;4.</p>
<table class="nobctr"><tr><td> </td><td> 1.&nbsp;........</td><td> P&nbsp;-&nbsp;Q&nbsp;R&nbsp;4.</td></tr></table>
<h3>PART II</h3>
<p class="cenhead">GAME 1. KING'S PAWN</p>
<p class="cenhead">(Somewhere, 1920)</p>
<p class="cenhead">White: A. Player. Black: B. Player.</p>
<table class="nobctr">
<tr><td> </td><td> 1.&nbsp;P&nbsp;-&nbsp;K&nbsp;4</td><td> P&nbsp;-&nbsp;K&nbsp;4</td></tr>
<tr><td> </td><td> 2.&nbsp;Q&nbsp;-&nbsp;R&nbsp;5</td><td> K&nbsp;-&nbsp;K&nbsp;2</td></tr>
</table>
<p>A strange move.</p>
<div class="figcenter"><img src="images/Fig2.jpg" alt="" /></div>
<table class="nobctr">
<tr><td> </td><td> 3.&nbsp;Q&nbsp;×&nbsp;K&nbsp;P&nbsp;ch</td><td> Resigns.</td></tr>
</table>
</body></html>"""

FIG1 = "8/p6p/4k3/8/4K3/8/P5PP/8 w - - 0 1"
FIG2 = "rnbq1bnr/ppppkppp/8/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR w KQ - 2 3"


def make_raw(tmp_path, fig2_fen=FIG2):
    raw = tmp_path / "raw"
    (raw / "gutenberg/1").mkdir(parents=True)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("1-h/1-h.htm", HTML.encode("latin-1"))
        z.writestr("1-h/images/Fig1.jpg", b"jpg1")
        z.writestr("1-h/images/Fig2.jpg", b"jpg2")
    (raw / "gutenberg/1/1-h.zip").write_bytes(buf.getvalue())
    book = tmp_path / "books/tiny"
    book.mkdir(parents=True)
    (book / "diagrams.tsv").write_text(
        "fig\tfen\tkind\tnote\n"
        f"Fig1\t{FIG1}\tposition\t\n"
        f"Fig2\t{fig2_fen}\tposition\t\n")
    spec = BookSpec(slug="tiny", title="Tiny Chess", author="A. Author", year=1920, gutenberg_id=1,
                    html_zip="gutenberg/1/1-h.zip", html_member="1-h/1-h.htm")
    return raw, tmp_path / "books", spec


def test_build_writes_chapter_with_fen_and_modern_main_line(tmp_path):
    raw, books, spec = make_raw(tmp_path)
    report = build_book(spec, raw, books)
    md = (books / "tiny/01-chapter-i-first-principles.md").read_text()
    assert "# Chapter I — First Principles" in md
    assert "## 1. Pawn Endings" in md
    assert f"```fen\n{FIG1}\n```" in md
    assert "1. g4 a5" in md                         # modern main line
    assert "1. P - K Kt 4." in md                   # original kept
    assert "![Diagram 1](images/Fig1.jpg)" in md
    assert (books / "tiny/images/Fig1.jpg").read_bytes() == b"jpg1"
    assert report["diagrams"]["Fig1"]["checked_moves"] == 2


def test_build_writes_games_with_san_pgn_and_result(tmp_path):
    raw, books, spec = make_raw(tmp_path)
    build_book(spec, raw, books)
    md = (books / "tiny/games/01-a-player-vs-b-player-1920.md").read_text()
    assert "**1. e4 e5 2. Qh5 Ke7**" in md
    assert "**3. Qxe5#**" in md
    pgn = (books / "tiny/games.pgn").read_text()
    assert '[White "A. Player"]' in pgn and '[Result "1-0"]' in pgn
    assert "1. e4 e5 2. Qh5 Ke7 3. Qxe5# 1-0" in pgn


def test_game_diagram_must_match_the_replayed_game(tmp_path):
    raw, books, spec = make_raw(tmp_path, fig2_fen="8/8/8/8/8/8/8/K6k w - - 0 1")
    with pytest.raises(DiagramMismatch):
        build_book(spec, raw, books)


def test_game_result_rules():
    b = chess.Board()
    b.push_san("e4")
    assert game_result(b, last_moves_text="1. P - K 4, Resigns.", after_text="") == "1-0"
    assert game_result(b, last_moves_text="1. P - K 4", after_text="Black resigned.") == "1-0"
    assert game_result(b, last_moves_text="1. P - K 4", after_text="and White resigned.") == "0-1"
    b2 = chess.Board(); b2.push_san("e4"); b2.push_san("e5")
    assert game_result(b2, last_moves_text="2. Resigns.", after_text="") == "0-1"
    assert game_result(chess.Board(), last_moves_text="", after_text="") == "*"


def test_build_writes_section_index_for_linking(tmp_path):
    raw, books, spec = make_raw(tmp_path)
    build_book(spec, raw, books)
    lines = (books / "tiny/sections.tsv").read_text().splitlines()
    assert lines[0] == "section\ttitle\tfile\tanchor\tdiagrams"
    assert lines[1] == "1\tPawn Endings\t01-chapter-i-first-principles.md\t#1-pawn-endings\tFig1"


def test_build_writes_readme_with_contents_and_checks(tmp_path):
    raw, books, spec = make_raw(tmp_path)
    build_book(spec, raw, books)
    readme = (books / "tiny/README.md").read_text()
    assert readme.startswith("# Tiny Chess — A. Author (1920)")
    assert "[1. Pawn Endings](01-chapter-i-first-principles.md#1-pawn-endings)" in readme
    assert "[Game 1: A. Player – B. Player, Somewhere, 1920 (1-0)](games/01-a-player-vs-b-player-1920.md)" in readme
    assert "2 diagrams" in readme and "Project Gutenberg #1" in readme
