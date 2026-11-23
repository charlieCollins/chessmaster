# Chess corpus — design

**Status:** approved 2026-11-23 ("proceed" on the layout + "transcribe every diagram as FEN").
Living description: `corpus/README.md`.

## Intent
The user wants the Learn area to teach by theme — what to do with knights, bishops, …, then
multi-move / multi-piece tactics — with practice. First step: gather the material locally as a
**corpus** we can build lessons (and Claude's explanations) from. Sources must be public domain
or CC0 so they can be adapted freely.

## Goals
- Store every source locally, recreatable from a manifest (`corpus/SOURCES.md`, `scripts/fetch_corpus.sh`).
- Turn books into readable markdown where **every diagram is a correct FEN** and moves are in modern notation.
- Make 6M Lichess puzzles queryable by theme and rating.
- One page per Learn topic joining book passages, puzzle themes and evidence.

## Non-goals (this step)
- Building the Learn UI itself (next design).
- Converting all downloaded books — Capablanca first (the user owns a print copy); others later.

## Approaches considered (diagrams)
1. **Transcribe every diagram to FEN (chosen).** Diagrams become boards, drills and engine positions.
2. Keep scans as images only — cheaper, but static: no drills, no verification.

## Decisions
- Raw downloads git-ignored; text layers committed; images + puzzle DB git-ignored (rebuildable).
  Whether to commit more (or only an index) stays open in `TODO.md`.
- Descriptive notation is parsed by matching legal moves, not by computing squares; "ch" marks and
  backtracking over later moves resolve ambiguity.
- Game diagrams come from replaying the game score and are enforced at build time.
- Lesson diagrams: kNN square classifier (trained on game diagrams) → review every board by eye
  → replay the book's main line from it. Original descriptive text is kept next to modern SAN so the
  corpus can be read alongside the paper book.
- Puzzles: full dump in SQLite, `puzzle_themes(theme, rating, id)` index; topic pages count puzzles
  per band with a quality floor (≥1000 plays, popularity ≥80).

## Left to the builder
- Topic wording and which sections/themes each topic uses (`corpus/topics/topics.toml`) — editable.
