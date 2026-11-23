"""Build a corpus book from a Project Gutenberg HTML edition.

Output (corpus/books/<slug>/):
  README.md                 overview, license, contents, diagram check summary
  NN-chapter-<x>-<title>.md one file per chapter: text, diagrams as ```fen```
                            blocks with the main line in modern notation
  games/NN-<white>-vs-<black>-<year>.md   one file per illustrative game
  games.pgn                 all illustrative games (modern SAN)
  images/                   original diagram scans (extracted; git-ignored)
Inputs: the raw zip under corpus/raw/ and the curated diagrams.tsv
(fig, fen, kind, note) that lives next to the output.
"""
from __future__ import annotations

import json
import re
import unicodedata
import zipfile
from dataclasses import dataclass
from pathlib import Path

import chess
import chess.pgn

from .descriptive import resolve_line, split_moves
from .gutenberg_html import extract_blocks
from .mainline import mainline_after


class DiagramMismatch(ValueError):
    """A game diagram in diagrams.tsv doesn't match the position reached by replaying the game."""


@dataclass
class BookSpec:
    slug: str
    title: str
    author: str
    year: int
    gutenberg_id: int
    html_zip: str          # relative to corpus/raw
    html_member: str       # path of the .htm inside the zip
    encoding: str = "latin-1"
    games_heading: str = "PART II"


ROMAN = re.compile(r"^CHAPTER ([IVXLC]+)$")
SECTION = re.compile(r"^(\d+)\. (.+)$")
GAME = re.compile(r"^GAME (\d+)\. (.+)$")


def slugify(text: str) -> str:
    t = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")


def github_anchor(heading: str) -> str:
    """The #fragment GitHub/most markdown renderers give a heading."""
    return "#" + re.sub(r"[^\w\- ]", "", heading.lower()).replace(" ", "-")


def title_case(text: str) -> str:
    small = {"a", "an", "and", "the", "of", "in", "on", "to", "with", "by", "for", "v.", "or"}
    words = text.replace("*", "").lower().split()
    return " ".join(w if (i and w in small) else w[:1].upper() + w[1:] for i, w in enumerate(words))


def load_diagrams(path: Path) -> dict[str, dict]:
    rows = {}
    lines = path.read_text().splitlines()
    for line in lines[1:]:
        if not line.strip():
            continue
        fig, fen, kind, *note = line.split("\t")
        rows[fig] = {"fen": fen, "kind": kind, "note": note[0] if note else ""}
    return rows


def game_result(final: chess.Board, last_moves_text: str, after_text: str) -> str:
    """Result of a book game: checkmate, an explicit "Black/White resigned", or
    "Resigns" in the score (the side to move resigned)."""
    if final.is_checkmate():
        return "0-1" if final.turn == chess.WHITE else "1-0"
    if re.search(r"\bBlack resign", after_text):
        return "1-0"
    if re.search(r"\bWhite resign", after_text):
        return "0-1"
    if re.search(r"\bResigns?\b", last_moves_text):
        return "0-1" if final.turn == chess.WHITE else "1-0"
    return "*"


def _fig(src: str) -> str | None:
    m = re.search(r"(Fig\d+)", src)
    return m.group(1) if m else None


def _side(board: chess.Board) -> str:
    return "White" if board.turn == chess.WHITE else "Black"


def _diagram_md(fig: str, fen: str, kind: str, note: str, caption: str) -> str:
    n = fig[3:]
    parts = [f"![Diagram {n}](images/{fig}.jpg)", "", f"```fen\n{fen}\n```"]
    if caption:
        parts += ["", caption]
    if note:
        parts += ["", f"*Note: {note}*"]
    return "\n".join(parts)


class _Book:
    def __init__(self, spec: BookSpec, raw: Path, books: Path):
        self.spec, self.raw = spec, raw
        self.out = books / spec.slug
        self.diagrams = load_diagrams(self.out / "diagrams.tsv")
        self.report: dict = {"diagrams": {}, "games": {}}
        self.sections: list[dict] = []
        self.book_diagrams: dict[str, dict] = {}

    # -- input -------------------------------------------------------------
    def read(self) -> list[dict]:
        with zipfile.ZipFile(self.raw / self.spec.html_zip) as z:
            html = z.read(self.spec.html_member).decode(self.spec.encoding)
            img_dir = self.out / "images"
            img_dir.mkdir(parents=True, exist_ok=True)
            for name in z.namelist():
                if "/images/" in name and not name.endswith("/"):
                    (img_dir / Path(name).name).write_bytes(z.read(name))
        return extract_blocks(html)

    # -- chapters ----------------------------------------------------------
    def chapters(self, blocks: list[dict]) -> list[Path]:
        stop = next((i for i, b in enumerate(blocks)
                     if b["kind"] == "heading" and b["text"] == self.spec.games_heading), len(blocks))
        starts = [i for i, b in enumerate(blocks[:stop]) if b["kind"] == "heading" and ROMAN.match(b["text"])]
        files = []
        for n, (a, z) in enumerate(zip(starts, starts[1:] + [stop]), 1):
            roman = ROMAN.match(blocks[a]["text"]).group(1)
            body = blocks[a + 1:z]
            subtitle = body[0]["text"] if body and body[0]["kind"] == "center" else ""
            if subtitle:
                body = body[1:]
            name = f"{n:02d}-chapter-{roman.lower()}-{slugify(subtitle)}.md"
            md = [f"# Chapter {roman} — {subtitle}" if subtitle else f"# Chapter {roman}", ""]
            md += self._render_part_one(body, name)
            (self.out / name).write_text("\n".join(md).rstrip() + "\n")
            files.append(self.out / name)
        return files

    def _render_part_one(self, body: list[dict], file_name: str) -> list[str]:
        md: list[str] = []
        for i, b in enumerate(body):
            k = b["kind"]
            if k == "center":
                m = SECTION.match(b["text"])
                if m:
                    title = title_case(m.group(2))
                    self.sections.append({"section": m.group(1), "title": title, "file": file_name,
                                          "anchor": github_anchor(f"{m.group(1)}. {title}"), "diagrams": []})
                elif self.sections:
                    self._block({"kind": "para", "text": b["text"]})
                md += [f"## {m.group(1)}. {title}" if m else f"*{b['text'].strip('*')}*", ""]
            elif k == "para":
                self._block({"kind": "para", "text": b["text"]})
                md += [b["text"], ""]
            elif k == "moves":
                self._block({"kind": "moves", "text": b["text"]})
                md += ["  \n".join(f"> {ln}" for ln in b["text"].split("\n")), ""]
            elif k == "figure":
                fig = _fig(b["src"])
                if fig:
                    self._block({"kind": "diagram", "fig": fig})
                    if self.sections:
                        self.sections[-1]["diagrams"].append(fig)
                    md += [self._part_one_diagram(fig, body[i + 1:]), ""]
        return md

    def _block(self, block: dict) -> None:
        """Record a block of the current Part I section (for book.json)."""
        if self.sections:
            self.sections[-1].setdefault("blocks", []).append(block)

    def _record_diagram(self, fig: str, fen: str, kind: str, note: str, start=None, moves=()) -> None:
        b = start.copy() if start is not None else None
        sans = []
        for mv in moves:
            sans.append(b.san(mv))
            b.push(mv)
        self.book_diagrams[fig] = {"fen": fen, "kind": kind, "note": note,
                                   "section": self.sections[-1]["section"] if self.sections else None,
                                   "line_uci": [mv.uci() for mv in moves], "line_san": sans}

    def _part_one_diagram(self, fig: str, following: list[dict]) -> str:
        row = self.diagrams.get(fig)
        if row is None:
            self.report["diagrams"][fig] = {"status": "missing"}
            return f"![Diagram {fig[3:]}](images/{fig}.jpg)\n\n*(Position not transcribed yet.)*"
        section = []
        for b in following:
            if b["kind"] in ("figure", "heading", "center"):
                break
            section.append(b)
        fen, kind = row["fen"], row["kind"]
        if kind != "position":
            self.report["diagrams"][fig] = {"status": kind, "checked_moves": 0}
            self._record_diagram(fig, fen, kind, row["note"])
            return _diagram_md(fig, fen, kind, row["note"], "*Illustration — not a complete game position.*")
        board = chess.Board(fen)
        line = mainline_after(board, section)
        self.report["diagrams"][fig] = {"status": "position", "checked_moves": len(line.sans), "error": line.error}
        start = board.copy()
        start.turn = line.side
        self._record_diagram(fig, start.fen(), kind, row["note"], start, line.moves)
        caption = f"*{_side(start)} to move.*"
        if line.moves:
            caption += f" **Main line:** {start.variation_san(line.moves)}"
        return _diagram_md(fig, start.fen(), kind, row["note"], caption)

    # -- games -------------------------------------------------------------
    def games(self, blocks: list[dict]) -> list[chess.pgn.Game]:
        stop = next((i for i, b in enumerate(blocks)
                     if b["kind"] == "heading" and b["text"] == self.spec.games_heading), None)
        if stop is None:
            return []
        starts = [i for i, b in enumerate(blocks) if i > stop and b["kind"] == "center" and GAME.match(b["text"])]
        ends = starts[1:] + [next((i for i, b in enumerate(blocks) if i > starts[-1] and b["kind"] == "heading"),
                                  len(blocks))] if starts else []
        (self.out / "games").mkdir(exist_ok=True)
        pgns = []
        for a, z in zip(starts, ends):
            pgns.append(self._game(blocks[a:z]))
        return pgns

    def _game(self, seg: list[dict]) -> chess.pgn.Game:
        num, opening = GAME.match(seg[0]["text"]).groups()
        centers = [b["text"] for b in seg[1:4] if b["kind"] == "center"]
        event = next((c.strip("()") for c in centers if c.startswith("(")), "")
        players = next((c for c in centers if c.startswith("White:")), "")
        pm = re.match(r"White:\s*(.+?)\.?\s+Black:\s*(.+?)\.?$", players)
        white, black = (pm.group(1).strip(), pm.group(2).strip()) if pm else ("?", "?")
        year = (re.search(r"(1[89]\d\d)", event) or [None, "????"])[1]

        per_block = [[t for ln in b["text"].split("\n") for t in split_moves(ln)] if b["kind"] == "moves" else []
                     for b in seg]
        all_texts = [t for ts in per_block for t in ts]
        moves, err = resolve_line(chess.Board(), all_texts)
        self.report["games"][num] = {"moves": len(moves), "of": len(all_texts), "error": err}

        board = chess.Board()
        used = 0
        md = [f"# Game {num}. {title_case(opening)}", "",
              f"**White:** {white} · **Black:** {black} · **Event:** {event}", ""]
        last_moves_text, after_last = "", []
        for pos, (b, texts) in enumerate(zip(seg, per_block)):
            k = b["kind"]
            if pos < 4 and k == "center":      # title / event / players, already in the header
                continue
            if k == "moves":
                chunk = moves[used:used + len(texts)]
                used += len(texts)
                san = board.variation_san(chunk) if chunk else ""
                for mv in chunk:
                    board.push(mv)
                orig = " · ".join(b["text"].split("\n"))
                md += [f"**{san}**  " if san else "", f"<sub>{orig}</sub>", ""]
                last_moves_text, after_last = b["text"], []
            elif k == "figure":
                fig = _fig(b["src"])
                if fig:
                    row = self.diagrams.get(fig)
                    if row is not None and row["kind"] == "position":
                        want = chess.Board(row["fen"])
                        if want.board_fen() != board.board_fen() or want.turn != board.turn:
                            raise DiagramMismatch(f"{fig}: diagrams.tsv has {row['fen']} but game {num} "
                                                  f"reaches {board.fen()} at this point")
                    self.report["diagrams"][fig] = {"status": "game", "checked_moves": board.ply()}
                    md += [_diagram_md(fig, board.fen(), "position", row["note"] if row else "",
                                       f"*Position after {board.ply()} plies — {_side(board)} to move.*"), ""]
            elif k == "para":
                md += [b["text"], ""]
                after_last.append(b["text"])
            elif k == "center":
                md += [f"*{b['text']}*", ""]

        result = game_result(board, last_moves_text, " ".join(after_last))
        game = chess.pgn.Game()
        game.headers.update({"Event": event or "?", "Site": "?", "Date": f"{year}.??.??", "Round": "?",
                             "White": white, "Black": black, "Result": result,
                             "Annotator": self.spec.author,
                             "Source": f"{self.spec.title} ({self.spec.year}), Game {num}"})
        node = game
        for mv in moves:
            node = node.add_variation(mv)
        pgn_text = str(game)
        md += ["## Game score", "", f"```pgn\n{pgn_text}\n```", ""]
        name = f"{int(num):02d}-{slugify(white)}-vs-{slugify(black)}-{year}.md"
        (self.out / "games" / name).write_text("\n".join(m for m in md).rstrip() + "\n")
        self.report["games"][num].update({"file": f"games/{name}", "white": white, "black": black,
                                          "event": event, "result": result, "opening": title_case(opening)})
        return game


NOTATION_PRIMER = """## Reading the original notation

The book uses **English descriptive notation**; this corpus adds modern algebraic
(SAN) next to it. Descriptive names a square from the *mover's* side: files are
named after the piece that starts there — Q R (a), Q Kt (b), Q B (c), Q (d), K (e),
K B (f), K Kt (g), K R (h) — and ranks count from the mover's own back rank. So
"P - K 4" is **e4** for White but **e5** for Black. "×" = captures, "ch" = check,
"Kt" = knight, "Castles" = O-O. Every move in the main lines was converted by
`corpus_tools/descriptive.py` and checked for legality against the position."""


def _readme(spec: BookSpec, report: dict, sections: list[dict]) -> str:
    diag = report["diagrams"]
    confirmed = sum(1 for d in diag.values() if d.get("checked_moves"))
    illus = sum(1 for d in diag.values() if d.get("status") == "illustration")
    md = [f"# {spec.title} — {spec.author} ({spec.year})", "",
          f"Source: Project Gutenberg #{spec.gutenberg_id} (public domain in the USA). "
          f"Built by `scripts/build_corpus.py` from `corpus/raw/{spec.html_zip}`; don't edit the chapter "
          "or game files by hand — fix `diagrams.tsv` or the tools and rebuild.", "",
          "## Diagrams", "",
          f"{len(diag)} diagrams, each stored as a FEN in `diagrams.tsv` and shown in the text as a "
          f"```` ```fen ```` block. {confirmed} are confirmed by replaying the book's own moves from them "
          f"(game diagrams by replaying the whole game); {illus} are illustrations rather than game positions; "
          "the rest were transcribed from the scans and reviewed by eye.", "",
          NOTATION_PRIMER, "", "## Contents", ""]
    by_file: dict[str, list[dict]] = {}
    for s in sections:
        by_file.setdefault(s["file"], []).append(s)
    for f in report["chapters"]:
        md.append(f"- **{f[:-3]}**")
        for s in by_file.get(f, []):
            figs = f" — diagrams {', '.join(x[3:] for x in s['diagrams'])}" if s["diagrams"] else ""
            md.append(f"  - [{s['section']}. {s['title']}]({f}{s['anchor']}){figs}")
    if report["games"]:
        md += ["", "## Illustrative games (`games.pgn`)", ""]
        for num, g in report["games"].items():
            md.append(f"- [Game {num}: {g['white']} – {g['black']}, {g['event']} ({g['result']})]({g['file']})"
                      f" — {g['opening']}")
    return "\n".join(md) + "\n"


def build_book(spec: BookSpec, raw: Path, books: Path) -> dict:
    """Build corpus/books/<slug>/ from the raw HTML; returns a report of every diagram/game check."""
    bk = _Book(spec, Path(raw), Path(books))
    blocks = bk.read()
    chapters = bk.chapters(blocks)
    games = bk.games(blocks)
    if games:
        (bk.out / "games.pgn").write_text("\n\n".join(str(g) for g in games) + "\n")
    bk.report["chapters"] = [p.name for p in chapters]
    bk.report["sections"] = bk.sections
    rows = ["section\ttitle\tfile\tanchor\tdiagrams"] + [
        f"{s['section']}\t{s['title']}\t{s['file']}\t{s['anchor']}\t{','.join(s['diagrams'])}" for s in bk.sections]
    (bk.out / "sections.tsv").write_text("\n".join(rows) + "\n")
    (bk.out / "README.md").write_text(_readme(spec, bk.report, bk.sections))
    book = {"slug": spec.slug, "title": spec.title, "author": spec.author,
            "sections": [{"section": s["section"], "title": s["title"], "blocks": s.get("blocks", [])}
                         for s in bk.sections],
            "diagrams": bk.book_diagrams}
    (bk.out / "book.json").write_text(json.dumps(book, ensure_ascii=False, indent=1) + "\n")
    return bk.report
