"""corpus/topics/*.md — one page per Learn topic, generated from topics.toml.

Each page joins the corpus up for one theme: key ideas, the book sections and
diagrams that teach it, and how many Lichess puzzles exist to drill it (overall
and, with a quality floor, per rating band). Edit topics.toml, then rebuild.
"""
from __future__ import annotations

import sqlite3
import tomllib
from pathlib import Path

BANDS = [(800, 1199), (1200, 1599), (1600, 1999)]
MIN_PLAYS, MIN_POPULARITY = 1000, 80


def _book_title(book_dir: Path) -> tuple[str, str]:
    first = (book_dir / "README.md").read_text().splitlines()[0].lstrip("# ")
    title, _, rest = first.partition(" — ")
    author = rest.rsplit(" (", 1)[0]
    return title, author


def _sections(book_dir: Path) -> dict[str, dict]:
    lines = (book_dir / "sections.tsv").read_text().splitlines()
    out = {}
    for ln in lines[1:]:
        sec, title, file, anchor, diagrams = (ln.split("\t") + [""])[:5]
        out[sec] = {"title": title, "file": file, "anchor": anchor,
                    "diagrams": [d for d in diagrams.split(",") if d]}
    return out


def _theme_counts(con: sqlite3.Connection, theme: str) -> list[int]:
    total = con.execute("SELECT count FROM themes WHERE theme = ?", (theme,)).fetchone()
    counts = [total[0] if total else 0]
    for lo, hi in BANDS:
        counts.append(con.execute(
            """SELECT count(*) FROM puzzle_themes t JOIN puzzles p ON p.id = t.id
               WHERE t.theme = ? AND t.rating BETWEEN ? AND ? AND p.plays >= ? AND p.popularity >= ?""",
            (theme, lo, hi, MIN_PLAYS, MIN_POPULARITY)).fetchone()[0])
    return counts


def build_topics(corpus: Path) -> list[Path]:
    corpus = Path(corpus)
    spec = tomllib.loads((corpus / "topics" / "topics.toml").read_text())["topic"]
    db = corpus / "puzzles" / "puzzles.sqlite"
    con = sqlite3.connect(db) if db.exists() else None
    books: dict[str, tuple] = {}
    written = []
    for t in spec:
        md = [f"# {t['title']}", "", f"*{t['group']}* · [all topics](README.md)", "", t["summary"], ""]
        if t.get("ideas"):
            md += ["## Key ideas", ""] + [f"- {i}" for i in t["ideas"]] + [""]
        if t.get("book"):
            md += ["## From the books", ""]
            for ref in t["book"]:
                slug, sec = ref.split(":")
                if slug not in books:
                    bdir = corpus / "books" / slug
                    books[slug] = (*_book_title(bdir), _sections(bdir))
                title, author, secs = books[slug]
                s = secs[sec]
                figs = f" — diagrams {', '.join(d[3:] for d in s['diagrams'])}" if s["diagrams"] else ""
                md.append(f"- *{title}* ({author}): [{sec}. {s['title']}](../books/{slug}/{s['file']}{s['anchor']}){figs}")
            md.append("")
        if t.get("themes"):
            md += ["## Practice puzzles (Lichess, CC0)", "",
                   f"Bands count puzzles with ≥ {MIN_PLAYS} plays and popularity ≥ {MIN_POPULARITY}; "
                   "query them with `corpus_tools.puzzles.puzzles_for_theme`.", "",
                   "| Theme | All puzzles | " + " | ".join(f"{lo}–{hi}" for lo, hi in BANDS) + " |",
                   "|---|---:|" + "---:|" * len(BANDS)]
            for theme in t["themes"]:
                counts = _theme_counts(con, theme) if con else ["?"] * (len(BANDS) + 1)
                md.append(f"| `{theme}` | " + " | ".join(f"{c:,}" if isinstance(c, int) else c for c in counts) + " |")
            md.append("")
        if t.get("drill"):
            md += ["## How to practise", "", t["drill"], ""]
        if t.get("app"):
            md += ["## In the app", "", t["app"], ""]
        path = corpus / "topics" / f"{t['slug']}.md"
        path.write_text("\n".join(md).rstrip() + "\n")
        written.append(path)
    if con:
        con.close()

    idx = ["# Topics", "",
           "One page per Learn topic, joining the corpus up: key ideas, where the books teach it, and how many "
           "real-game puzzles exist to drill it. Generated from `topics.toml` by `scripts/build_corpus.py`.", ""]
    groups: dict[str, list] = {}
    for t in spec:
        groups.setdefault(t["group"], []).append(t)
    for g, ts in groups.items():
        idx += [f"## {g}", ""] + [f"- [{t['title']}]({t['slug']}.md) — {t['summary']}" for t in ts] + [""]
    (corpus / "topics" / "README.md").write_text("\n".join(idx).rstrip() + "\n")
    return written
