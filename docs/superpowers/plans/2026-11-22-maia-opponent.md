# Maia Human-like Opponent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the player choose a Maia (human-trained neural net) opponent at 1100–1900, defaulting to Maia 1300, while all feedback stays on full-strength Stockfish.

**Architecture:** A `MaiaEngine` wraps lc0 over UCI (1 node per move) and samples among Maia's likely moves for variety. `main.py` gets a third `EngineSlot` and routes the opponent's move choice by a new `games.engine` column. The frontend reads `GET /api/engines` to build the opponent picker.

**Tech Stack:** FastAPI, python-chess UCI, lc0 v0.32.1 + Maia v1.0 weights, React/TS.

**Spec:** `docs/superpowers/specs/2026-11-22-maia-opponent-design.md`

## Global Constraints

- Maia levels: exactly `[1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900]`; weights file `maia-{level}.pb.gz`.
- Maia plays with `chess.engine.Limit(nodes=1)` — never deeper search.
- Variety: sample among policy moves with probability **≥ 5%**, weighted by probability; fall back to Maia's top move.
- `LC0_PATH` env → `shutil.which("lc0")`; `MAIA_WEIGHTS_DIR` env → `~/.local/share/maia`.
- `games.engine` TEXT: `"stockfish"` (default; existing rows) or `"maia"`.
- Hints, live evals and analysis stay on the full-strength Stockfish `_hint_engine`.
- App must work unchanged when lc0/weights are absent (Maia hidden, Maia requests → 400).
- Default opponent in the UI: Maia 1300 if available, else Stockfish ~1000.

## Review Focus

1. lc0 installed but weights dir empty/missing → Maia reported unavailable; `POST /api/game` with `engine: "maia"` → 400, not 500. *(Task 2 test `test_maia_unavailable_rejected`)*
2. Policy contains moves that are illegal or unparseable in the position → only legal moves are sampled. *(Task 1 test `test_choose_ignores_illegal_moves`)*
3. Promotion moves in the policy (`a7a8q`) → parsed and playable. *(Task 1 test `test_parse_policy_handles_promotion`)*
4. Existing DB rows created before the column → read as `"stockfish"`, labelled as before. *(Task 2 test `test_game_defaults_to_stockfish`)*
5. Alternating Stockfish and Maia games in one server session → each uses its own engine, no cross-talk. *(Task 2 test `test_stockfish_and_maia_games_interleave`)*

---

### Task 1: `MaiaEngine` with policy sampling

**Files:**
- Modify: `backend/engine.py` (add after `ChessEngine`), `backend/config.py`
- Test: `tests/test_maia.py` (create)
- Modify: `TODO.md` (deploy: build lc0 + download weights)

**Interfaces:**
- Produces (`backend/config.py`): `MAIA_LEVELS: list[int]`, `MAIA_POLICY_FLOOR = 0.05`
- Produces (`backend/engine.py`):
  - `LC0_PATH: str | None`, `MAIA_WEIGHTS_DIR: pathlib.Path`
  - `maia_available() -> bool` — binary resolvable AND every `maia-{level}.pb.gz` exists
  - `parse_policy(info_strings: list[str]) -> dict[str, float]` — uci → probability (0–1); regex per line `^(\S+)\s.*\(P:\s*([\d.]+)%\)`; ignores lines that don't match (e.g. `node` summary)
  - `choose_from_policy(board: chess.Board, policy: dict[str, float], rng: random.Random) -> str | None` — keep legal moves with p ≥ `MAIA_POLICY_FLOOR`; weighted `rng.choices`; if none qualify, highest-p legal move; `None` if no legal move in policy
  - `class MaiaEngine(level: int = 1300, rng: random.Random | None = None)` with `set_level(level: int) -> None` (raises `ValueError` if not in `MAIA_LEVELS`; reconfigures `WeightsFile` only when level changes), `get_best_move(fen: str, time_limit: float = 0.1) -> str | None` (`time_limit` ignored; `None` if game over), `close() -> None`

- [ ] **Step 1: Write failing tests** in `tests/test_maia.py`:

```python
needs_maia = pytest.mark.skipif(not maia_available(), reason="lc0/Maia weights not installed")

def test_parse_policy_reads_probabilities():
    lines = ["e7e5  (322 ) N: 0 (+ 0) (P: 41.14%) (WL: -.-----)",
             "c7c5  (264 ) N: 0 (+ 0) (P: 15.02%) (WL: -.-----)",
             "node  ( 20 ) N: 1 (+ 0) (P: 100.00%)"]   # summary line — "node" isn't a move
    assert parse_policy(lines) == {"e7e5": pytest.approx(0.4114), "c7c5": pytest.approx(0.1502)}

def test_parse_policy_handles_promotion():
    assert parse_policy(["a7a8q (1 ) N: 0 (+ 0) (P: 80.00%)"]) == {"a7a8q": pytest.approx(0.8)}

def test_choose_only_samples_moves_above_floor():
    board = chess.Board(); board.push_uci("e2e4")
    policy = {"e7e5": 0.41, "c7c5": 0.15, "g7g6": 0.03}
    picks = {choose_from_policy(board, policy, random.Random(s)) for s in range(200)}
    assert picks == {"e7e5", "c7c5"}

def test_choose_ignores_illegal_moves():
    board = chess.Board()
    assert choose_from_policy(board, {"e2e5": 0.9, "d2d4": 0.06}, random.Random(0)) == "d2d4"

def test_choose_falls_back_to_top_legal_move():
    board = chess.Board()
    assert choose_from_policy(board, {"e2e4": 0.04, "d2d4": 0.03}, random.Random(0)) == "e2e4"

@needs_maia
def test_maia_plays_legal_moves_and_varies():
    eng = MaiaEngine(level=1300, rng=random.Random(1))
    try:
        after_e4 = chess.Board(); after_e4.push_uci("e2e4")
        moves = {eng.get_best_move(after_e4.fen()) for _ in range(30)}
        assert all(chess.Move.from_uci(m) in after_e4.legal_moves for m in moves)
        assert len(moves) >= 2
    finally:
        eng.close()

@needs_maia
def test_maia_rejects_unknown_level():
    eng = MaiaEngine()
    try:
        with pytest.raises(ValueError):
            eng.set_level(1000)
    finally:
        eng.close()
```

- [ ] **Step 2:** Run `.venv/bin/pytest tests/test_maia.py -v` — expected: ImportError (names don't exist).
- [ ] **Step 3: Implement** the Interfaces above. lc0 launch: `SimpleEngine.popen_uci([LC0_PATH, f"--weights={path}", "--threads=1"])` with stderr discarded, then `configure({"VerboseMoveStats": True})`. Collect info strings by iterating `engine.analysis(board, Limit(nodes=1))` and reading each info's `"string"`. If `parse_policy` returns nothing, use `engine.play(board, Limit(nodes=1)).move`.
- [ ] **Step 4:** Run `.venv/bin/pytest -q` — all pass (Maia tests run locally, not skipped).
- [ ] **Step 5:** Add to `TODO.md` → "Deploy the app": build lc0 v0.32.1 CPU-only (`meson setup build/release --buildtype=release -Dgtest=false -Dplain_cuda=false -Donnx=false -Dopenblas=false -Daccelerate=false -Dmetal=disabled -Dblas=true -Dnative_arch=false`), install to PATH, `gh release download v1.0 --repo CSSLab/maia-chess --pattern "maia-1*.pb.gz"` into `MAIA_WEIGHTS_DIR`.
- [ ] **Step 6: Commit** `feat(engine): MaiaEngine with policy sampling`

### Task 2: Backend — `games.engine`, routing, `/api/engines`

**Files:**
- Modify: `backend/db.py` (column + migration), `backend/main.py`, `backend/game_utils.py` (`generate_pgn` names)
- Test: `tests/test_maia_api.py` (create; same in-memory DB/override pattern as `tests/test_robustness.py`)

**Interfaces:**
- Consumes: `MaiaEngine`, `maia_available()`, `MAIA_LEVELS` (Task 1)
- Produces:
  - `Game.engine = Column(String, default="stockfish")`; migration `ALTER TABLE games ADD COLUMN engine TEXT DEFAULT 'stockfish'`
  - `StartGameRequest.engine: Literal["stockfish", "maia"] = "stockfish"`
  - `run_game_engine(engine: str, elo: int, fn)` — routes to `_game_engine` (Stockfish, `set_elo`) or new `_maia_engine` slot (`set_level`); all existing call sites pass `game.engine`
  - `GET /api/engines` → `{"maia": {"available": bool, "levels": [1100, …, 1900]}}`
  - `"engine"` key added to `POST /api/game`, `GET /api/game/{id}`, `GET /api/games` rows
  - `opponent_name(engine: str, elo: int) -> str` in `game_utils.py`: `"Maia 1300"` / `"Stockfish 1000"`; used for the PGN White/Black header

- [ ] **Step 1: Write failing tests:**
  - `test_engines_endpoint_reports_maia` — `GET /api/engines` → `maia.levels == [1100, …, 1900]`, `available` equals `maia_available()`
  - `test_game_defaults_to_stockfish` — `POST /api/game` without `engine` → response and `GET /api/game/{id}` have `engine == "stockfish"`
  - `test_maia_game_plays_legal_reply` *(skip unless available)* — start `{"engine": "maia", "engine_elo": 1300}`, move `e2e4` → 200, reply legal, `engine_eval_cp` is a number
  - `test_maia_rejects_level_outside_range` — `engine: "maia", engine_elo: 1000` → 400
  - `test_maia_unavailable_rejected` — monkeypatch `backend.main.maia_available` → `False`; maia start → 400 with "not installed" in detail
  - `test_stockfish_and_maia_games_interleave` *(skip unless available)* — SF game move, Maia game move, SF game move → all 200
  - `test_pgn_names_maia_opponent` *(skip unless available)* — finish (resign) a Maia game as white → `GET`'s stored PGN (query `Game.pgn`) contains `[Black "Maia 1300"]`
- [ ] **Step 2:** Run `.venv/bin/pytest tests/test_maia_api.py -v` — expected failures: 404 on `/api/engines`, missing `engine` key.
- [ ] **Step 3: Implement.** Validation order in `start_game`: engine=maia and not `maia_available()` → 400 `"Maia is not installed on this server"`; level not in `MAIA_LEVELS` → 400. Stockfish validation unchanged.
- [ ] **Step 4:** Run `.venv/bin/pytest -q` — all pass.
- [ ] **Step 5: Commit** `feat(api): Maia opponents via games.engine and /api/engines`

### Task 3: Frontend picker + labels, docs

**Files:**
- Modify: `frontend/src/pages/Play.tsx`, `frontend/src/pages/Home.tsx`, `frontend/src/pages/Review.tsx`, `CLAUDE.md`
- Create: `frontend/src/opponents.ts`

**Interfaces:**
- Consumes: `GET /api/engines`, `engine` field on game/list responses (Task 2)
- Produces (`opponents.ts`): `type EngineKind = "stockfish" | "maia"`; `opponentLabel(engine: EngineKind, elo: number): string` → `"Maia 1300"`, `"Stockfish ~1000"` (tilde below 1320), `"Stockfish 1500"`

- [ ] **Step 1: Play setup:** fetch `/api/engines` on mount. Select value encodes both parts (`"maia:1300"`, `"stockfish:1000"`). Optgroups in order: "Human-like (Maia)" (only if available), "Skill Level (approximate)", "UCI ELO (Stockfish)". Default `maia:1300` if available, else `stockfish:1000`. Hint line for Maia: `"trained on human games · plays human-style mistakes"`. Send `engine` in `POST /api/game`; keep `engine` in `GameState`.
- [ ] **Step 2: Labels:** Play sidebar "Engine" box shows `opponentLabel` (drop the Skill/UCI tag for Maia); Home games-table opponent column and Review "Opponent (…)" sublabel use `opponentLabel`.
- [ ] **Step 3:** `cd frontend && npx tsc -b && npx eslint . && npm run build` — all exit 0.
- [ ] **Step 4: Manual check** via running dev server: `/api/engines` through the proxy reports Maia available; start a Maia 1300 game via the API through the proxy and play 3 moves → legal replies; ask the user to try the picker in the browser.
- [ ] **Step 5:** Update `CLAUDE.md`: Engine Strength Modes (Maia row), API table (`/api/engines`, `engine` param), DB schema (`engine` column), Key Dependencies (lc0 + Maia, env vars).
- [ ] **Step 6: Commit** `feat(ui): Maia opponent picker and labels` (include the pending Play eval-wording change)
