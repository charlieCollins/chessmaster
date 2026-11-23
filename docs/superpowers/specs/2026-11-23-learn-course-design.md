# Learn area — topic course (phase 1 of "course, then daily trainer")

**Status:** draft for approval, 2026-11-23.
**Builds on:** `docs/superpowers/specs/2026-11-23-chess-corpus-design.md`, `corpus/README.md`.

## Intent
The user (≈1300–1500 on chess.com, adult, owns a print copy of Capablanca's *Chess
Fundamentals*) wants the Learn area to teach by theme — per piece, then tactics and multi-move
combinations, endgames, strategy — **with practice**, to actually get stronger. Evidence notes
(`corpus/research/`) say solving beats reading, volume of real patterns matters, and spaced
review helps. Chosen shape (user picked option 3): **build the course now, with a review
queue; add a daily trainer later** that uses the solving history this phase records.

## Goals
- Learn home lists the 23 corpus topics by group with progress, your puzzle rating, and how
  many reviews are due.
- Each topic is a lesson in three steps: **Read → Find the move → Practise**.
- Interactive solving on the board for Capablanca diagrams and Lichess puzzles.
- An adaptive puzzle rating (starts 1300) that picks puzzles near your level.
- A review queue: missed positions return after 1, 3, 7, 21 days until solved first try.
- Every attempt recorded (so the daily trainer can find weak themes later).

## Non-goals (this phase)
- The daily trainer / "Today" session.
- Positions from the user's own game mistakes (waits for the trainer — user's call).
- Rewriting the six hand-written piece lessons (they stay, as the Read step for those topics).
- Converting more books; hosting changes (2 GB puzzle DB on the VM is a `TODO.md` item).

## Anti-goals
- A page you only read. Every topic must end with positions to solve.
- Puzzles far above/below the user's level, or the same puzzle served again in practice.
- Losing solving history (it's the trainer's input).

## Approaches considered
1. **Backend serves lessons from the corpus; progress in `chess.db` (chosen).** One source of
   truth; the trainer later queries the same tables.
2. Lesson content as build-time JSON in the frontend, puzzles + attempts via API — two data
   paths, rebuild on every corpus edit.
3. Frontend-only with localStorage — impossible for the 2 GB puzzle DB; history invisible to
   the server/trainer.

## Design

### Lesson flow (what the user sees)
```
Learn                                   rating 1342 · 7 reviews due [Start review]
 PIECES        ♞ Knights  ▓▓▓▓░░ 62% (13 solved)   ♝ Bishops ░░░░░░ —   …
 TACTICS       ⚔ Forks …
 COMBINATIONS  …   ENDGAMES …   STRATEGY …        Openings (existing hub) ↗
```
Topic page — three step tabs, with Read first time, Practise on later visits:
1. **Read** — the topic's key ideas, then the Capablanca sections it cites rendered in-app
   (paragraphs + static diagram boards + the original move text). For the six piece topics
   the existing tip-card lesson comes first.
2. **Find the move** — the topic's Capablanca diagrams that have a verified main line. You
   play the side to move; the board answers with Capablanca's replies. A drill asks for at
   most your first **3** moves of the line; then "See how Capablanca continues" steps through
   the rest. A move that isn't Capablanca's but is engine-judged as good (win% loss < 5, same
   classifier as Play) is accepted: "Also good — Capablanca played Nf3", and the line continues
   with his move.
3. **Practise** — sets of **10** Lichess puzzles from the topic's themes near your rating,
   never served before in practice. Puzzle convention: the opponent's first move is played
   automatically, you play the solution; a checkmating move is always accepted.

Which positions belong to a topic: the diagrams in the book sections the topic cites
(`topics.toml` → `sections.tsv`) whose kind is `position` and whose main line has at least
one move for the side to move. Topics without book sections (e.g. Forks) skip Find the move;
topics without puzzle themes (Basic checkmates) skip Practise. Puzzles show the board from
the solver's side (the side *not* to move in the Lichess FEN).

Solving rules (both kinds): the **first try counts** — a drill or puzzle is "solved" only if
every move you're asked for was right (or accepted as also good) on the first attempt. A wrong move → "Not quite" + retry;
"Show solution" plays it out. A miss (wrong first move, or solution shown) → the position
enters the review queue.

### Rating, progress, review
- **Puzzle rating:** Elo-style, `R += K·(score − 1/(1+10^((Rp−R)/400)))`, K = 40 for the first
  30 rated attempts, then 20; start 1300. Only first attempts at Lichess puzzles in Practise
  are rated (book drills and reviews are not).
- **Puzzle choice:** themes of the topic, rating within R ± 150 (widen to ± 300 if empty),
  quality floor plays ≥ 1000 and popularity ≥ 80, not previously attempted, random among
  matches; must respond in < 0.5 s on the full DB.
- **Topic progress:** first-try success rate over the topic's last 20 rated attempts, shown
  with the count of puzzles solved. "—" until there are 5 attempts. Topics without puzzles use
  their drills instead: share of the topic's drills whose latest attempt was solved.
- "Not previously attempted" means no `learn_attempts` row for that puzzle; a puzzle you
  opened and left without moving can come back.
- **Review queue:** item = (kind, ref). Miss → step 0, due in 1 day. Solved first try in
  review → next step (3 d, 7 d, 21 d); solving the 21-day step removes it. Miss in review →
  back to step 0. "Start review" serves all due items, oldest first, mixed kinds.

### Data (new tables in `chess.db`, created by `init_db()`)
- `learn_attempts` — id, kind (`puzzle`|`book`), ref (Lichess id | `<book>:<Fig>`), topic,
  context (`lesson`|`review`), solved (first try), revealed, seconds, puzzle_rating,
  rating_before, rating_after (null when unrated), created_at.
- `learn_reviews` — kind, ref (unique together), topic, step, due_at, updated_at.
- `learn_state` — key/value: `puzzle_rating`, `rated_attempts`.

### Corpus inputs
- `build_book` additionally writes `corpus/books/<slug>/book.json` (committed): sections
  (number, title, blocks: para text / original moves / diagram fig) and diagrams (fig, fen,
  side, kind, main line as UCI + SAN, section). The backend loads topics.toml + book.json at
  startup; `CORPUS_DIR` env overrides the path (tests use a tiny corpus).
- Puzzles from `corpus/puzzles/puzzles.sqlite` (`PUZZLES_DB` env overrides). If missing, the
  Practise step shows "Puzzle database not built — run `scripts/build_corpus.py puzzles`" and
  everything else works.

### API (new, under `/api/learn`)
| Method | Path | Returns |
|---|---|---|
| GET | `/api/learn/topics` | groups → topics (slug, title, summary, progress), `rating`, `reviews_due` |
| GET | `/api/learn/topics/{slug}` | ideas, book sections (blocks), drills (fig, fen, line), themes, `piece_lesson` flag |
| GET | `/api/learn/topics/{slug}/puzzles?n=10` | puzzles per the selection rules (fen, moves UCI, rating, themes) |
| POST | `/api/learn/judge` | `{fen, move, expected}` → `{accepted, verdict}` via the hint engine (book drills only) |
| POST | `/api/learn/attempts` | records an attempt; returns new rating (if rated) and review state |
| GET | `/api/learn/reviews` | due items with everything needed to solve them |

### Frontend
- `Learn.tsx` becomes the hub (topics from the API + Openings card); the existing piece-lesson
  and openings components move unchanged into `pages/learn/`.
- New: `TopicLesson` (three steps), `SolveBoard` (one position + expected line; plays replies,
  judges moves, retry / reveal, promotion picker, reports the attempt), `BookText` (renders
  blocks; `*italic*`/`**bold**` only), `ReviewSession`.
- Solving logic (is this move the expected one? is it mate? what's the reply?) lives in a pure
  `solveLine.ts`, unit-tested with **vitest** (new dev dependency — builder's call, since the
  frontend has no test runner today).

## Decided by the builder (marked as calls, easy to change)
- Drill length 3 moves, puzzle set size 10, rating band ± 150, K-factors, review intervals.
- Piece-lesson tip cards shown before the Capablanca text on those six topics.
- vitest for frontend pure logic.
- Openings hub stays as its own card; "Opening principles" topic links to it.

## Out of scope / follow-ups
Daily trainer (weak themes from `learn_attempts`, own-game mistakes), hosting the puzzle DB.
