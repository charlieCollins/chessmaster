# Chess corpus

Local, public-domain / CC0 chess knowledge that the Learn area (and Claude, when teaching)
works from. Three layers:

| Layer | What | In git? |
|-------|------|---------|
| `raw/` | Untouched downloads: Lichess puzzle dump + openings, Gutenberg books, papers. Manifest + licenses in [`SOURCES.md`](SOURCES.md). Rebuild with `scripts/fetch_corpus.sh`. | No (~360 MB) |
| `books/`, `puzzles/` | **Derived** from raw by `scripts/build_corpus.py`: books as markdown with every diagram as a verified FEN; puzzles as a theme-indexed SQLite DB. | Text yes; `images/` and `puzzles.sqlite` no |
| `topics/`, `research/` | **Curated**: one page per Learn topic joining books + puzzles; short sourced notes on how people get better at chess. | Yes |

```
corpus/
  SOURCES.md                    every source, license, download date
  raw/                          (git-ignored) fetch_corpus.sh output
  books/<slug>/
    README.md                   contents, diagram checks, notation primer   (generated)
    NN-chapter-*.md             chapters: text + ```fen``` diagrams + modern main lines (generated)
    games/NN-*.md, games.pgn    annotated games in modern notation          (generated)
    diagrams.tsv                fig → FEN (+ kind, note)                    (CURATED — the one input)
    sections.tsv                section → file#anchor + diagrams            (generated)
    images/                     original scans                              (git-ignored)
  puzzles/
    README.md                   schema, how to read a puzzle, all 73 themes (generated)
    puzzles.sqlite              6.2M puzzles, ~2 GB                         (git-ignored)
  topics/
    topics.toml                 topic definitions                          (CURATED)
    README.md, <topic>.md       one page per topic                          (generated)
  research/*.md                 evidence notes                              (curated)
```

## Rebuild from scratch

```bash
scripts/fetch_corpus.sh                          # downloads into corpus/raw (skips what's there)
.venv/bin/python scripts/build_corpus.py puzzles # books + puzzle DB (~2 min) + topic pages
.venv/bin/python scripts/build_corpus.py         # books + topic pages only (~20 s)
```

Generated files are overwritten on every build — change `diagrams.tsv`, `topics.toml` or
the code in `corpus_tools/` instead.

## How the books were made trustworthy

Old books print diagrams as scanned images and moves in English descriptive notation
("P - K Kt 4"). For *Chess Fundamentals*:

1. **Notation:** `corpus_tools/descriptive.py` reads descriptive moves by testing every
   legal move against the description (check marks and later moves settle ambiguities).
   All 14 illustrative games (1,171 moves) replay completely.
2. **Game diagrams (53):** taken from the replayed game; the build fails if `diagrams.tsv`
   ever disagrees with the game score.
3. **Lesson diagrams (97):** a square classifier trained on the game diagrams made a first
   guess; every board was then reviewed against the scan and corrected by eye; then each
   position was checked by replaying the book's own main line from it (`corpus_tools/mainline.py`).
   78 replay at least one book move; the rest are "look at this position" diagrams or
   illustrations (3 have no kings).

## Using it

- **Teaching (Claude):** for a topic, start at `topics/<topic>.md`; quote the book section,
  show the diagram FEN, and pull drill positions with
  `corpus_tools.puzzles.puzzles_for_theme(db, theme, lo, hi, min_plays=1000, min_popularity=80)`.
- **Learn area (app):** topics → lessons; book diagrams → "find the move" positions with the
  verified main line as the answer; puzzles → theme drills by rating band.

## Adding a book

Add a `BookSpec` in `scripts/build_corpus.py`, transcribe its diagrams into
`books/<slug>/diagrams.tsv` (the classifier pipeline used for Capablanca is described in
`docs/superpowers/specs/2026-11-23-chess-corpus-design.md`), build, and check the report.
Downloaded but not yet converted: Lasker *Chess Strategy* (168 diagrams), Staunton *Blue Book*
(78), Lasker *Chess and Checkers* (text only), Philidor *Studies of Chess* (text only).
