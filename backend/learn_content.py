# backend/learn_content.py
"""Lesson content for the Learn area, loaded from the corpus.

topics.toml defines the topics; each book's book.json (written by
scripts/build_corpus.py) supplies section text and diagrams with Capablanca's
main line, which become "find the move" drills.
"""
from __future__ import annotations

import json
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

PIECE_LESSONS = {"knights", "bishops", "rooks", "pawns", "queens", "kings"}
MAX_DRILL_MOVES = 3


@dataclass
class Corpus:
    topics: list[dict]
    books: dict[str, dict] = field(default_factory=dict)


def load_corpus(corpus_dir: Path) -> Corpus:
    corpus_dir = Path(corpus_dir)
    topics = tomllib.loads((corpus_dir / "topics" / "topics.toml").read_text())["topic"]
    books = {}
    for t in topics:
        for ref in t.get("book", []):
            slug = ref.split(":")[0]
            if slug not in books:
                books[slug] = json.loads((corpus_dir / "books" / slug / "book.json").read_text())
    return Corpus(topics=topics, books=books)


def _drill(book: dict, fig: str, topic: str | None, section_title: str | None) -> dict | None:
    d = book["diagrams"].get(fig)
    if not d or d["kind"] != "position" or not d["line_uci"]:
        return None
    user_moves = (len(d["line_uci"]) + 1) // 2
    return {"ref": f"{book['slug']}:{fig}", "topic": topic, "fig": fig, "fen": d["fen"],
            "line_uci": d["line_uci"], "line_san": d["line_san"],
            "ask_moves": min(MAX_DRILL_MOVES, user_moves),
            "book_title": book["title"], "section_title": section_title}


def _sections(c: Corpus, t: dict) -> list[tuple[dict, dict]]:
    out = []
    for ref in t.get("book", []):
        slug, num = ref.split(":")
        book = c.books[slug]
        sec = next((s for s in book["sections"] if s["section"] == num), None)
        if sec:
            out.append((book, sec))
    return out


def _drills(c: Corpus, t: dict) -> list[dict]:
    drills = []
    for book, sec in _sections(c, t):
        for b in sec["blocks"]:
            if b["kind"] == "diagram":
                d = _drill(book, b["fig"], t["slug"], f"{sec['section']}. {sec['title']}")
                if d:
                    drills.append(d)
    return drills


def topic_summaries(c: Corpus) -> list[dict]:
    return [{"slug": t["slug"], "title": t["title"], "group": t["group"], "summary": t["summary"],
             "has_drills": bool(_drills(c, t)), "has_puzzles": bool(t.get("themes"))} for t in c.topics]


def topic_detail(c: Corpus, slug: str) -> dict | None:
    t = next((t for t in c.topics if t["slug"] == slug), None)
    if t is None:
        return None
    sections, diagrams = [], {}
    for book, sec in _sections(c, t):
        sections.append({"book_title": book["title"], "author": book["author"], "section": sec["section"],
                         "title": sec["title"], "blocks": sec["blocks"]})
        for b in sec["blocks"]:
            if b["kind"] == "diagram" and b["fig"] in book["diagrams"]:
                diagrams[b["fig"]] = book["diagrams"][b["fig"]]
    return {"slug": t["slug"], "title": t["title"], "group": t["group"], "summary": t["summary"],
            "ideas": t.get("ideas", []), "themes": t.get("themes", []), "drill_tip": t.get("drill", ""),
            "piece_lesson": t["slug"] in PIECE_LESSONS, "sections": sections, "diagrams": diagrams,
            "drills": _drills(c, t)}


def find_drill(c: Corpus, ref: str) -> dict | None:
    slug, _, fig = ref.partition(":")
    book = c.books.get(slug)
    if book is None:
        return None
    section = book["diagrams"].get(fig, {}).get("section")
    sec = next((s for s in book["sections"] if s["section"] == section), None)
    return _drill(book, fig, None, f"{sec['section']}. {sec['title']}" if sec else None)
