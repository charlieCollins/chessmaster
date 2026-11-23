# Learn Course Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Learn into a topic course — Read → Find the move (Capablanca drills) → Practise (Lichess puzzles near your rating) — with an adaptive puzzle rating, a spaced review queue, and every attempt recorded.

**Architecture:** The corpus build additionally emits `book.json`; a new backend router (`/api/learn`) loads topics + book data and queries `puzzles.sqlite`, storing attempts/reviews/rating in `chess.db`. The frontend splits today's 1,659-line `Learn.tsx` into `pages/learn/`, adds a pure, vitest-tested `solveLine.ts`, a `SolveBoard`, a three-step `TopicLesson`, and a `ReviewSession`.

**Tech Stack:** FastAPI + SQLAlchemy (SQLite), python-chess, Stockfish (hint engine); React 19 + react-chessboard v5 + chess.js; pytest; vitest (new dev dep).

**Spec:** `docs/superpowers/specs/2026-11-23-learn-course-design.md`

## Global Constraints

- Start rating **1300**; K = **40** for the first **30** rated attempts, then **20**; expected score `1/(1+10^((Rp−R)/400))`.
- Only first attempts at Lichess puzzles in a lesson (context `lesson`) are rated; book drills and reviews never.
- Puzzle selection: topic themes, rating R ± **150** (widen to ± **300** if fewer than n found), `plays ≥ 1000`, `popularity ≥ 80`, never previously attempted; < **0.5 s** on the full DB.
- Review intervals **1, 3, 7, 21** days; a miss → step 0 (due +1 day); solving the 21-day step removes the item.
- Drill asks for at most **3** user moves; puzzle sets of **10**.
- "Also good" = win% loss < **5** (same model as `game_utils.win_percent`), judged with the hint engine.
- Topic progress: first-try rate over the last **20** rated attempts, "—" until **5**; drill-only topics: share of drills whose latest attempt was solved.
- Env overrides: `CORPUS_DIR` (default `<repo>/corpus`), `PUZZLES_DB` (default `<CORPUS_DIR>/puzzles/puzzles.sqlite`).
- Missing puzzle DB → only the puzzle endpoints return 503 (`"Puzzle database not built — run scripts/build_corpus.py puzzles"`).
- Backend tests set `os.environ["DATABASE_URL"] = "sqlite://"` before importing backend modules (existing pattern).

## Review Focus

1. **Solver plays Black in a Lichess puzzle** — board must be oriented to the solver and `moves[0]` auto-played for the other side. Test: `lichessToLine` on a White-to-move FEN gives `userColor: "b"` (Task 6).
2. **Promotion in a solution** (`a7a8q`) — full 5-char UCI compared; under-promotion `a7a8n` ≠ `a7a8q`. Test in `checkMove` (Task 6).
3. **A different mating move** in a puzzle is accepted (Lichess rule). Test in `checkMove` (Task 6).
4. **Re-attempting a puzzle** (review, or practice after a reload) must not be rated twice. API test (Task 5).
5. **No puzzle DB** — topics, drills, attempts, reviews of book items keep working; only puzzle endpoints 503. API test (Task 5).

---

### Task 1: `book.json` from the book build

**Files:**
- Modify: `corpus_tools/book.py`
- Test: `tests/test_book.py`
- Regenerate: `corpus/books/capablanca-chess-fundamentals/book.json`

**Interfaces:**
- Produces `corpus/books/<slug>/book.json`:
  ```json
  {"slug": "...", "title": "...", "author": "...",
   "sections": [{"section": "1", "title": "Pawn Endings",
                 "blocks": [{"kind": "para", "text": "..."}, {"kind": "moves", "text": "..."},
                            {"kind": "diagram", "fig": "Fig1"}]}],
   "diagrams": {"Fig1": {"fen": "<start fen, correct side to move>", "kind": "position",
                         "section": "1", "line_uci": ["g2g4", "a7a5"], "line_san": ["g4", "a5"], "note": ""}}}
  ```
  Only Part I (chapter) diagrams; blocks are the section's blocks in order (center lines inside a section become `para` with the text).

- [ ] **Step 1: Write the failing test** `test_build_writes_book_json_with_sections_and_drill_lines`:
  load `books/tiny/book.json`; assert `sections[0]["section"] == "1"`, `sections[0]["title"] == "Pawn Endings"`,
  `{"kind": "diagram", "fig": "Fig1"} in sections[0]["blocks"]`, `diagrams["Fig1"]["line_uci"] == ["g2g4", "a7a5"]`,
  `diagrams["Fig1"]["line_san"] == ["g4", "a5"]`, `diagrams["Fig1"]["fen"] == FIG1`.
- [ ] **Step 2:** `.venv/bin/pytest tests/test_book.py -k book_json -v` → FAIL (file missing).
- [ ] **Step 3:** In `_Book`, append blocks to the current section while rendering Part I; store each Part I diagram's start FEN + line in `self.book_diagrams`; `build_book` writes `book.json` (`json.dumps(..., ensure_ascii=False, indent=1)`).
- [ ] **Step 4:** `.venv/bin/pytest tests/test_book.py -v` → all PASS.
- [ ] **Step 5:** `.venv/bin/python scripts/build_corpus.py` → `book.json` exists with 33 sections, 97 diagrams.
- [ ] **Step 6: Commit** `feat(corpus): book.json (sections, blocks, drill lines) for the Learn API`.

### Task 2: Learning content loader

**Files:**
- Create: `backend/learn_content.py`
- Create: `tests/learn_fixtures.py` (builds a tiny corpus in a tmp dir: the tiny book from `tests/test_book.py`, a `topics.toml` with 3 topics, a 6-puzzle DB)
- Test: `tests/test_learn_content.py`

**Interfaces:**
- Consumes: `book.json` (Task 1), `topics/topics.toml`, `books/*/sections.tsv`.
- Produces:
  - `PIECE_LESSONS = {"knights", "bishops", "rooks", "pawns", "queens", "kings"}`
  - `@dataclass Corpus: topics: list[dict]; books: dict[str, dict]`
  - `load_corpus(corpus_dir: Path) -> Corpus`
  - `topic_summaries(c: Corpus) -> list[dict]` — `slug, title, group, summary, has_drills, has_puzzles` (spec order)
  - `topic_detail(c: Corpus, slug: str) -> dict | None` — `slug, title, group, summary, ideas, themes, piece_lesson: bool, sections: [{book_title, author, section, title, blocks}], drills: [drill]`
  - drill dict: `ref ("<book slug>:<Fig>"), topic, fig, fen, line_uci, line_san, ask_moves (min(3, user moves in line)), section_title`
  - `find_drill(c: Corpus, ref: str) -> dict | None`
  - `make_tiny_corpus(tmp_path) -> Path` in `tests/learn_fixtures.py`

- [ ] **Step 1: Write failing tests:** `test_summaries_in_spec_order_with_flags` (3 topics; a topic with themes → `has_puzzles`; a topic citing the tiny book section → `has_drills`); `test_detail_has_sections_and_drills` (`drills[0]["ref"] == "tiny:Fig1"`, `ask_moves == 1` because the line is White g4, Black a5 → one user move); `test_piece_lesson_flag` (`knights` → True); `test_unknown_topic_is_none`; `test_find_drill_by_ref`.
- [ ] **Step 2:** `.venv/bin/pytest tests/test_learn_content.py -v` → FAIL (module missing).
- [ ] **Step 3:** Implement; drills = diagrams of the cited sections with `kind == "position"` and `line_uci` non-empty, in section order.
- [ ] **Step 4:** tests PASS; also `load_corpus(Path("corpus"))` on the real corpus gives 23 topics and `topic_detail(..., "knights")["drills"]` non-empty.
- [ ] **Step 5: Commit** `feat(learn): load topics, book sections and drills from the corpus`.

### Task 3: Rating, review scheduling, progress + tables

**Files:**
- Create: `backend/learn_progress.py`
- Modify: `backend/db.py` (models only; `create_all` makes the tables)
- Test: `tests/test_learn_progress.py`

**Interfaces:**
- `START_RATING = 1300.0`, `REVIEW_DAYS = (1, 3, 7, 21)`
- `expected_score(rating: float, puzzle_rating: float) -> float`
- `update_rating(rating: float, puzzle_rating: float, solved: bool, rated_attempts: int) -> float`
- `next_review(step: int | None, solved: bool, now: datetime) -> tuple[int, datetime] | None` — `step=None` means not in the queue; returns the new (step, due) or None (not queued / graduated).
- `topic_progress(results: list[bool]) -> dict` — `{"attempts": n, "solved": k, "accuracy": float | None}` over the last 20 (None if < 5).
- Models in `db.py`: `LearnAttempt(id, kind, ref, topic, context, solved, revealed, seconds, puzzle_rating, rating_before, rating_after, created_at)`, `LearnReview(id, kind, ref, topic, step, due_at, updated_at; unique index (kind, ref))`, `LearnState(key PK, value Float)`.

- [ ] **Step 1: Write failing tests:**
  `test_expected_score_equal_ratings_is_half` (0.5); `test_update_uses_k40_then_k20` (`update_rating(1300,1300,True,0) == 1320`, `update_rating(1300,1300,True,30) == 1310`, loss `update_rating(1300,1300,False,0) == 1280`);
  `test_miss_enters_queue_at_step0` (`next_review(None, False, t) == (0, t+1d)`); `test_solve_not_in_queue_stays_out` (`next_review(None, True, t) is None`);
  `test_steps_advance_then_graduate` (`(0,True)→(1,t+3d)`, `(1,True)→(2,t+7d)`, `(2,True)→(3,t+21d)`, `(3,True)→None`); `test_review_miss_resets` (`next_review(2, False, t) == (0, t+1d)`);
  `test_progress_needs_five` (`[True]*4 → accuracy None`), `test_progress_last_20` (25 results, first 5 False then 20 True → accuracy 1.0, attempts 20);
  `test_tables_created` (`init_db(engine)` on a fresh in-memory engine creates `learn_attempts`, `learn_reviews`, `learn_state`).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `.venv/bin/pytest tests/test_learn_progress.py -v` → PASS; full `pytest` still green.
- [ ] **Step 5: Commit** `feat(learn): puzzle rating, review schedule, topic progress, tables`.

### Task 4: Puzzle selection and lookup

**Files:**
- Modify: `corpus_tools/puzzles.py`
- Test: `tests/test_puzzles.py`

**Interfaces:**
- `select_puzzles(db_path, themes: list[str], rating: float, n: int, exclude: set[str], band: int = 150, max_band: int = 300, min_plays: int = 1000, min_popularity: int = 80, rng: random.Random | None = None) -> list[dict]` — dicts as `puzzles_for_theme`; unique ids; random order; widens to `max_band` when fewer than n.
- `get_puzzle(db_path, puzzle_id: str) -> dict | None`

- [ ] **Step 1: Write failing tests** (extend the CSV fixture to include ratings 1250/1300/1500/1700 with plays ≥ 1000): `test_select_within_band` (rating 1300, band 150 → only 1150–1450); `test_select_widens_when_short`; `test_select_excludes_attempted`; `test_select_dedupes_multi_theme_matches`; `test_get_puzzle`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** Implement (`ORDER BY random()` over the joined, filtered set, `LIMIT n + len(exclude)`, then filter in Python).
- [ ] **Step 4:** tests PASS; on the real DB, `select_puzzles(db, ["fork"], 1300, 10, set())` takes < 0.5 s (print the timing). If not, switch to picking random offsets within the (theme, rating) index range and note the ruling.
- [ ] **Step 5: Commit** `feat(puzzles): random selection near a rating, lookup by id`.

### Task 5: `/api/learn` router

**Files:**
- Create: `backend/learn_api.py` (`router = APIRouter(prefix="/api/learn")`; dependencies `get_corpus()`, `get_puzzles_db()` so tests override them)
- Modify: `backend/main.py` (`app.include_router(learn_router)`), `backend/config.py` (`CORPUS_DIR`, `PUZZLES_DB`)
- Test: `tests/test_learn_api.py` (TestClient + in-memory DB override like `tests/test_maia_api.py`; tiny corpus from `tests/learn_fixtures.py`)

**Interfaces:**
- `GET /topics` → `{"rating": float, "reviews_due": int, "groups": [{"group", "topics": [summary + "progress": {attempts, solved, accuracy}]}]}` — topics with puzzles: `topic_progress` over their rated puzzle attempts; drill-only topics: `attempts` = drills attempted, `solved` = drills whose latest attempt was solved, `accuracy = solved / total drills` (None until one attempt)
- `GET /topics/{slug}` → `topic_detail` + `"puzzles_available": bool`; 404 unknown
- `GET /topics/{slug}/puzzles?n=10` → `{"rating", "puzzles": [{id, fen, moves, rating, themes}]}`; `[]` for a topic without themes; 503 without DB
- `POST /attempts` body `{kind: "puzzle"|"book", ref, topic, context: "lesson"|"review", solved, revealed, seconds, puzzle_rating?}` → `{"rated": bool, "rating_before", "rating_after", "review": {"step", "due_at"} | null}`; rated iff kind puzzle, context lesson, no earlier attempt at that ref; the review row is created/advanced/reset/deleted via `next_review` (a revealed solution counts as a miss)
- `GET /reviews` → `{"items": [{kind, ref, topic, step, due_at, position}]}` (due now, oldest first; `position` = puzzle dict or drill dict; items whose source vanished are skipped)
- `POST /judge` `{fen, move, expected}` → `{"accepted": bool, "verdict": "expected"|"mate"|"good"|"not_good"}`; 400 for invalid FEN/illegal move; engine evals both resulting positions with `LIVE_EVAL_TIME`; accepted when the mover's win% loss < 5

- [ ] **Step 1: Write failing tests:** topics listing (rating 1300, reviews_due 0, progress "—"/None); topic detail + 404; puzzles near rating + exclusion after an attempt; **rated once** (second attempt at the same puzzle → `rated: false`, rating unchanged) [RF4]; book drill miss → review due tomorrow, not in `/reviews` today, appears when `due_at` is moved into the past; review solved advances step; **no DB** (`get_puzzles_db` → missing path): `/topics` 200, `/topics/{slug}/puzzles` 503, `/reviews` still returns book items [RF5]; judge: expected move → `expected` without engine; a clearly bad move → `not_good`; an equal alternative (e.g. 1.e4 vs expected 1.d4 from the start position) → `good`; illegal move → 400.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** Implement; include the router in `main.py`.
- [ ] **Step 4:** `.venv/bin/pytest -q` → all PASS.
- [ ] **Step 5:** Restart backend (`./chess.sh restart`); `curl -s localhost:8000/api/learn/topics | head -c 300` shows 5 groups; `curl -s 'localhost:8000/api/learn/topics/forks/puzzles?n=3'` returns 3 puzzles.
- [ ] **Step 6: Commit** `feat(learn): /api/learn — topics, drills, puzzles, attempts, reviews, judge`.

### Task 6: Frontend solving logic + vitest

**Files:**
- Modify: `frontend/package.json` (dev dep `vitest`, script `"test": "vitest run"`)
- Create: `frontend/src/pages/learn/solveLine.ts`, `frontend/src/pages/learn/solveLine.test.ts`

**Interfaces:**
- `type Side = "w" | "b"`
- `interface Line { startFen: string; moves: string[]; userColor: Side; autoFirst: boolean; askMoves: number }`
- `lichessToLine(p: { fen: string; moves: string[] }): Line` — userColor = side to move after `moves[0]`; `autoFirst: true`; `askMoves` = all user moves
- `drillToLine(d: { fen: string; line_uci: string[]; ask_moves: number }): Line` — userColor = side to move in fen; `autoFirst: false`
- `userMoveIndices(line: Line): number[]` — indices into `moves` the user must play (first `askMoves` of their moves)
- `applyUci(fen: string, uci: string): string`
- `checkMove(fen: string, uci: string, expected: string): "correct" | "mate" | "wrong" | "illegal"`

- [ ] **Step 1: Write failing tests:** `lichessToLine` on `"r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24"` + `["f2g3","e6e7","b2b1","b3c1","b1c1","h6c1"]` → userColor `"w"`, indices `[1,3,5]`; a White-to-move FEN → userColor `"b"` [RF1]; `drillToLine` with ask 3 on a 10-move line → indices `[0,2,4]`; `checkMove` exact → correct; promotion `a7a8q` vs expected `a7a8q` correct, `a7a8n` → wrong [RF2]; an alternative mate in one → `"mate"` [RF3]; illegal → `"illegal"`.
- [ ] **Step 2:** `cd frontend && npm i -D vitest && npx vitest run` → FAIL.
- [ ] **Step 3:** Implement with chess.js.
- [ ] **Step 4:** `npm test` PASS; `npm run build` PASS.
- [ ] **Step 5: Commit** `feat(learn-ui): pure solving logic with vitest`.

### Task 7: Split `Learn.tsx`; hub from the API

**Files:**
- Create: `frontend/src/pages/learn/shared.tsx` (MiniBoard, TipCard, SectionLabel, useBoardSize, `sq`, colour consts), `PieceLessons.tsx` (the six lesson components, unchanged bodies, exported), `Openings.tsx` (OpeningCard, OpeningsHub, OpeningDetail), `api.ts` (typed fetch wrappers for every Task 5 endpoint)
- Modify: `frontend/src/pages/Learn.tsx` → hub only

**Interfaces:**
- `api.ts`: `getTopics()`, `getTopic(slug)`, `getPuzzles(slug, n)`, `postAttempt(a)`, `getReviews()`, `judge(fen, move, expected)` with TS types mirroring Task 5.
- Hub: header "Learn · rating 1342 · 7 reviews due [Start review]"; groups as sections of TopicCards (title, summary, progress bar or "—"); plus the Openings card. `onOpenTopic(slug)`, `onStartReview()` drive local state.

- [ ] **Step 1:** Move code (no behaviour change) → `npm run build` PASS; the six lessons and Openings open as before (manual check in the browser).
- [ ] **Step 2:** Hub from `getTopics()`; loading and "backend not reachable" states like `Home.tsx`.
- [ ] **Step 3:** `npm run build` PASS; browser: 5 groups, 23 topics + Openings.
- [ ] **Step 4: Commit** `refactor(learn-ui): split Learn.tsx; topic hub from /api/learn`.

### Task 8: `SolveBoard`

**Files:**
- Create: `frontend/src/pages/learn/SolveBoard.tsx`

**Interfaces:**
- Props: `{ line: Line; judge?: (fen: string, uci: string, expected: string) => Promise<boolean>; continuation?: string[]; onResult: (r: { solved: boolean; revealed: boolean; seconds: number }) => void }`
- Behaviour: orientation = `line.userColor`; auto-plays `moves[0]` after 600 ms when `autoFirst`; on a user move: `checkMove` → correct/mate → play it and the reply (400 ms); wrong → if `judge` and it returns true → "Also good — the book played X", continue with the expected move; else "Not quite" (first-try flag lost), board resets to before the move; illegal → snap back. Buttons: "Show solution" (plays remaining user/reply moves, revealed), after finish "See how it continues" (steps through `continuation`), "Next". Promotion picker reused from Play's pattern. `onResult` fires once per position.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** `npm run build` PASS; browser check with a temporary harness (a puzzle where the solver is Black, one with a promotion) — then remove the harness.
- [ ] **Step 3: Commit** `feat(learn-ui): SolveBoard — solve a line on the board`.

### Task 9: `TopicLesson` (Read / Find the move / Practise) + `BookText`

**Files:**
- Create: `frontend/src/pages/learn/BookText.tsx`, `frontend/src/pages/learn/TopicLesson.tsx`
- Modify: `frontend/src/pages/Learn.tsx` (open a topic)

**Interfaces:**
- `BookText({ blocks, diagrams })` — paragraphs (only `*…*` / `**…**` rendered), original moves as muted monospace, diagrams as `MiniBoard` with "White/Black to move".
- `TopicLesson({ slug, onBack })` — step tabs (Read · Find the move · Practise, absent steps hidden); first visit opens Read, later visits Practise (remember per topic in localStorage, try/catch); piece topics show "Open the <Knights> lesson cards" which renders the existing lesson with `onBack` returning here.
- Find the move: drills one at a time ("Diagram 33 · 2 of 9"), `SolveBoard` with `judge`, `continuation` = remaining line; result → `postAttempt({kind:"book", context:"lesson", …})`.
- Practise: `getPuzzles(slug, 10)` → solve in turn → `postAttempt({kind:"puzzle", context:"lesson", puzzle_rating, …})`; show rating change ("1342 → 1351"); end of set: "8/10 first try · Next set".

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** `npm run build` PASS; browser: Knights → Read shows ideas, lesson cards link, Capablanca §14 text with diagrams; Find the move solves diagram 33; Practise serves 10 fork/knight puzzles and the rating moves.
- [ ] **Step 3: Commit** `feat(learn-ui): topic lessons — read, find the move, practise`.

### Task 10: `ReviewSession`

**Files:**
- Create: `frontend/src/pages/learn/ReviewSession.tsx`
- Modify: `frontend/src/pages/Learn.tsx`

- [ ] **Step 1:** Implement: `getReviews()` → solve each due item with `SolveBoard` (puzzle → `lichessToLine`, book → `drillToLine` + judge) → `postAttempt({context:"review"})`; end screen "6 of 7 solved first try — next due …"; empty state "Nothing due — come back tomorrow".
- [ ] **Step 2:** `npm run build` PASS; browser: miss a puzzle, set its `due_at` into the past with `sqlite3 chess.db "update learn_reviews set due_at=datetime('now','-1 hour')"`, it appears in review; solving it schedules +3 days.
- [ ] **Step 3: Commit** `feat(learn-ui): review session for missed positions`.

### Task 11: Docs and final checks

**Files:**
- Modify: `CLAUDE.md` (API table: the six `/api/learn` endpoints; DB schema: three learn tables; Architecture: new files; Learn description), `TODO.md` (daily trainer next; puzzle DB for hosting)

- [ ] **Step 1:** Update docs.
- [ ] **Step 2:** `.venv/bin/pytest -q` all PASS; `cd frontend && npm test && npm run build` PASS.
- [ ] **Step 3: Commit** `docs: Learn course in CLAUDE.md and TODO`.
