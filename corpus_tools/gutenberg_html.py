"""Project Gutenberg chess-book HTML -> ordered blocks.

Block kinds:
  heading  {level, text}
  para     {text}          inline <i>/<b> kept as markdown
  figure   {src}           a diagram image
  moves    {text}          a main-line move run ("1. P - K 4, P - K 4"), one line per table row
  center   {text}          other centred lines (game titles, players, events)
Page-number spans and empty paragraphs are dropped.
"""
from __future__ import annotations

import html
import re
from html.parser import HTMLParser

_MOVE_HINT = re.compile(r"(\b(K|Q|R|B|Kt|P)\s*[-×x]\s*\w)|Castles|\bO\s*-\s*O|^\s*\d+\.\s*\.{2,}")


def _clean(text: str) -> str:
    text = html.unescape(text).replace("\xa0", " ")
    return re.sub(r"\s+", " ", text).strip()


def looks_like_moves(text: str) -> bool:
    return bool(_MOVE_HINT.search(text))


class _Parser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks: list[dict] = []
        self.buf: list[str] | None = None      # text of the current p / h / td
        self.kind = None                         # "p", "cenhead", "h1".."h6", "td"
        self.skip = 0                            # inside a pagenum span
        self.table_rows: list[list[str]] | None = None
        self.row: list[str] | None = None

    # -- helpers -------------------------------------------------------
    def _start(self, kind):
        self.kind, self.buf = kind, []

    def _finish(self):
        if self.buf is None:
            return
        text = _clean("".join(self.buf))
        kind, self.buf, self.kind = self.kind, None, None
        if not text:
            return
        if kind and kind.startswith("h"):
            self.blocks.append({"kind": "heading", "level": int(kind[1]), "text": text})
        elif kind == "cenhead":
            self.blocks.append({"kind": "moves" if looks_like_moves(text) else "center", "text": text})
        else:
            self.blocks.append({"kind": "para", "text": text})

    # -- parser callbacks ------------------------------------------------
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get("class", "") or ""
        if self.skip:
            if tag == "span":
                self.skip += 1
            return
        if tag == "span" and "pagenum" in cls:
            self.skip = 1
        elif tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self._start(tag)
        elif tag == "p":
            self._start("cenhead" if "cenhead" in cls else "p")
        elif tag == "table":
            self.table_rows = []
        elif tag == "tr" and self.table_rows is not None:
            self.row = []
        elif tag == "td" and self.row is not None:
            self._start("td")
        elif tag == "img" and a.get("src", "").startswith("images/"):
            self.blocks.append({"kind": "figure", "src": a["src"]})
        elif tag in ("i", "em") and self.buf is not None and self.kind != "td":
            self.buf.append("*")
        elif tag in ("b", "strong") and self.buf is not None and self.kind != "td":
            self.buf.append("**")
        elif tag == "br" and self.buf is not None:
            self.buf.append(" ")

    def handle_endtag(self, tag):
        if self.skip:
            if tag == "span":
                self.skip -= 1
            return
        if tag in ("i", "em") and self.buf is not None and self.kind != "td":
            self.buf.append("*")
        elif tag in ("b", "strong") and self.buf is not None and self.kind != "td":
            self.buf.append("**")
        elif tag == "td" and self.kind == "td":
            self.row.append(_clean("".join(self.buf)))
            self.buf, self.kind = None, None
        elif tag == "tr" and self.row is not None:
            cells = [c for c in self.row if c]
            if cells:
                self.table_rows.append(cells)
            self.row = None
        elif tag == "table" and self.table_rows is not None:
            self._flush_table()
        elif tag in ("p", "h1", "h2", "h3", "h4", "h5", "h6"):
            self._finish()

    def handle_data(self, data):
        if not self.skip and self.buf is not None:
            self.buf.append(data)

    def _flush_table(self):
        rows, self.table_rows = self.table_rows, None
        lines = []
        for cells in rows:
            if len(cells) == 1:
                lines.append(cells[0])
            else:
                white, black = cells[0], " ".join(cells[1:])
                sep = " " if white.endswith("..") else ", "
                lines.append(f"{white}{sep}{black}")
        text = "\n".join(lines)
        if not text:
            return
        if looks_like_moves(text):
            self.blocks.append({"kind": "moves", "text": text})
        else:
            self.blocks.append({"kind": "para", "text": text.replace("\n", " ")})


def extract_blocks(source: str) -> list[dict]:
    p = _Parser()
    p.feed(source)
    p.close()
    return p.blocks
