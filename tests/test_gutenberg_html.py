# tests/test_gutenberg_html.py
# Turning a Project Gutenberg chess-book HTML file into an ordered list of blocks.
from corpus_tools.gutenberg_html import extract_blocks

SNIPPET = """
<h2>CHAPTER I</h2>
<p><!-- Page 17 --><span class="pagenum"><a name="page17"></a>{17}</span></p>
<p><b>Example 10.</b>&mdash;In these cases <i>act
  immediately</i> on the side.</p>
<div class="figcenter">
  <a href="images/Fig10.jpg"><img style="width:100%" src="images/Fig10.jpg" alt="Chess position" /></a>
</div>
<p class="cenhead">1.&nbsp;P&nbsp;-&nbsp;K&nbsp;Kt&nbsp;4.</p>
<table class="nobctr" style="width:40%">
<tr><td class="nspcsingle"> &nbsp;</td><td class="nspcsingle"> &nbsp; 1.&nbsp;........</td><td class="nspcsingle"> P&nbsp;-&nbsp;Q&nbsp;R&nbsp;4.</td></tr>
<tr><td class="nspcsingle"> &nbsp;</td><td class="nspcsingle"> 10.&nbsp;P&nbsp;×&nbsp;P</td><td class="nspcsingle"> </td></tr>
</table>
<p class="cenhead">GAME 1. QUEEN'S GAMBIT DECLINED</p>
"""


def test_blocks_in_document_order():
    blocks = extract_blocks(SNIPPET)
    assert [b["kind"] for b in blocks] == ["heading", "para", "figure", "moves", "moves", "center"]


def test_heading_and_inline_markup():
    blocks = extract_blocks(SNIPPET)
    assert blocks[0] == {"kind": "heading", "level": 2, "text": "CHAPTER I"}
    assert blocks[1]["text"] == "**Example 10.**—In these cases *act immediately* on the side."


def test_page_numbers_dropped_and_figure_src_kept():
    blocks = extract_blocks(SNIPPET)
    assert all("{17}" not in b.get("text", "") for b in blocks)
    assert blocks[2] == {"kind": "figure", "src": "images/Fig10.jpg"}


def test_move_lines_from_paragraph_and_table_rows():
    blocks = extract_blocks(SNIPPET)
    assert blocks[3]["text"] == "1. P - K Kt 4."
    # table rows become one "N. white, black" line each; skipped white move kept as ........
    assert blocks[4]["text"] == "1. ........ P - Q R 4.\n10. P × P"


def test_non_move_centered_text_is_center_block():
    assert extract_blocks(SNIPPET)[5] == {"kind": "center", "text": "GAME 1. QUEEN'S GAMBIT DECLINED"}
