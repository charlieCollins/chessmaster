# Chess Trainer

Self-hosted chess trainer web app. FastAPI backend + React (Vite TS) frontend.
Runs on localhost, single user, no auth. (Public hosting is planned but not working yet — see `TODO.md`.)

## Quick Start

### One command (recommended)
```bash
./chess.sh             # start backend + frontend
./chess.sh stop        # stop both
./chess.sh restart     # stop then start
```

- Backend:  http://localhost:8000
- Frontend: http://localhost:5174

### Manual
```bash
# Terminal 1 — backend
source .venv/bin/activate
pip install -r requirements-dev.txt   # first time only (runtime deps: requirements.txt)
uvicorn backend.main:app --reload

# Terminal 2 — frontend
cd frontend && npm install && npm run dev
```

The Vite dev server proxies `/api` to `localhost:8000`, so the frontend always calls same-origin `/api/...`.

### Tests
```bash
source .venv/bin/activate
pytest -v
```

## Architecture

- `backend/main.py` — FastAPI app, routes, lifespan (engine init/shutdown)
- `backend/engine.py` — Stockfish wrapper (`get_best_move`, `evaluate`, `full_strength` param) + `EngineSlot` (lock + auto-restart after a Stockfish crash)
- `backend/db.py` — SQLAlchemy models: Game, Move. SQLite at `chess.db` (env: `DATABASE_URL`)
- `backend/game_utils.py` — `reconstruct_board`, `generate_pgn`, win%-based `classify_move`, shared `accuracy_summary`
- `backend/analysis.py` — Post-game analysis: iterates all moves, classifies each with full-strength Stockfish
- `backend/config.py` — App configuration: timing constants (ENGINE_MOVE_TIME, HINT_TIME, ANALYSIS_TIME, LIVE_EVAL_TIME), DEFAULT_ENGINE_ELO, CORS_ORIGINS
- `frontend/src/App.tsx` — Routing shell (Home / Play / Learn / Review pages)
- `frontend/src/themes.ts` — Theme definitions: Classic, Forest, Ocean, Night, Autumn, Obsidian; maps theme names to CSS variable overrides
- `frontend/src/config.ts` — Frontend config: `API` base (default `""` = same origin; override via `VITE_API_BASE`) and UI timing constants
- `frontend/src/opponents.ts` — `opponentLabel` ("Maia 1300" / "Stockfish ~1000"), picker value encoding
- `frontend/src/classify.ts` — Win%-based move classification for live Play highlights (mirrors `game_utils.py`)
- `frontend/src/pages/Home.tsx` — Dashboard: win/loss stats + completed game history table
- `frontend/src/pages/Play.tsx` — Interactive board, play vs engine, color/ELO selection, eval bar, hint, best-reply
- `frontend/src/pages/Review.tsx` — Annotated game replay with nav controls, run-analysis button, accuracy score
- `frontend/src/pages/Learn.tsx` — Lesson pages (Knights, Bishops, Rooks, Pawns, Queens, Kings, Openings hub + detail)
- `frontend/src/data/openings.ts` — Opening data: 18 openings (58 lines) with SAN move sequences

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/engines` | Opponent families available: `{maia: {available, levels}}` |
| POST | `/api/game` | Start new game (`player_color`, `engine` = `stockfish`\|`maia`, `engine_elo`; Maia levels 1100–1900, 400 if Maia not installed) |
| GET | `/api/game/{id}` | Get game state + moves (+ per-side `accuracy` once analyzed) |
| POST | `/api/game/{id}/move` | Make a move. Returns engine reply, `eval_cp` (after your move), `engine_eval_cp` (after the reply), `termination`. Nothing is saved if the engine fails. |
| POST | `/api/game/{id}/takeback` | Undo last two plies (marks game `assisted=1`) |
| POST | `/api/game/{id}/resign` | Resign the game |
| DELETE | `/api/game/{id}` | Delete a game and its moves |
| POST | `/api/game/{id}/analyze` | Run post-game Stockfish analysis (~4–30s (depends on game length)) |
| GET | `/api/game/{id}/hint` | Best move for current position (marks game `assisted=1`) |
| POST | `/api/engine/best` | Best move for any FEN (`{fen}`) — NOT tracked as assisted; rejects impossible positions (they crash Stockfish) |
| GET | `/api/games` | List completed games (with player `accuracy`) |
| GET | `/api/stats` | Aggregate win/loss/accuracy stats |

**Note on `GET /api/game/{id}` moves:** Per-move `eval_cp` and `eval_loss_cp` are stored in the DB during analysis but NOT returned in the response. Only `classification` and `best_uci` are returned. Live evals are returned during gameplay via `POST /api/game/{id}/move`; both come from the full-strength engine.

## Engine Strength Modes

Opponent = `games.engine` + `games.engine_elo`.

| Engine / range | Mode | Notes |
|-------|------|-------|
| Maia 1100–1900 | lc0 + Maia net, 1 node | Human-trained (Lichess ratings). Samples among moves Maia gives ≥5% probability. Default in UI. |
| Stockfish <1320 | `Skill Level` 0–20 | Move randomization; approximate ELOs only |
| Stockfish 1320–3190 | `UCI_Elo` | Stockfish-calibrated at longer time controls; plays somewhat weaker at our 0.1s/move |

Skill Level mapping (`_SKILL_BY_ELO` in `engine.py`):
- ≤1000 → Skill 0, ≤1100 → Skill 3, ≤1200 → Skill 6, ≤1300 → Skill 9 (UI options: 1000/1100/1200/1300)

**Important**: Stockfish's Elo scale isn't human ratings: measured 2026-11-22, Skill 0 ≈ 1030 on Stockfish's scale, yet it almost never hangs material, so it plays far above a human 1000. That's why Maia exists.

Three `EngineSlot`s in `main.py` (each lock-guarded, lazily started, restarted once on crash):
- `_game_engine` / `_maia_engine` (via `run_game_engine(engine, elo, fn)`) — opponent, ONLY chooses the opponent's moves
- `_hint_engine` (via `run_hint_engine(fn)`) — full strength; every eval/best move shown to the player

## Key Dependencies

- `chess` (python-chess) — board logic, FEN/PGN, move validation, UCI engine protocol
- Stockfish binary — `STOCKFISH_PATH` env var if set, else `shutil.which("stockfish")`, else bare `"stockfish"` (fails clearly if not installed)
- lc0 + Maia weights (optional) — `LC0_PATH` env or `lc0` on PATH (locally `~/.local/bin/lc0` → `~/.local/src/lc0/build/release/lc0`); weights `maia-{1100..1900}.pb.gz` in `MAIA_WEIGHTS_DIR` (default `~/.local/share/maia`). Without them Maia is hidden.
- `react-chessboard` v5 — interactive board component (uses `options={{...}}` prop, not flat props)
- `chess.js` — client-side FEN reconstruction for move replay in Review and Learn pages

## Eval Convention

Centipawns from White's perspective (positive = good for White). Mate = ±10000 (minus distance to mate).
Play page converts to player's POV for display. The Play eval panel shows the eval of the position on the
board (`engine_eval_cp`); the "Last move" delta compares evals immediately before/after *your* move only.

## Move Classification Thresholds

Classification uses **win-percentage points lost** (Lichess model:
`win% = 50 + 50·(2/(1+e^(−0.00368208·cp)) − 1)`), so the same cp swing matters less in decided positions.
Playing the engine's own top move is always `best`. Same thresholds live in `game_utils.py` and `frontend/src/classify.ts`.

| Classification | Win% lost |
|----------------|-----------|
| Best | engine's top move, or <= 0 |
| Good | < 5 |
| Inaccuracy | 5–10 |
| Mistake | 10–15 |
| Blunder | >= 15 |

**Accuracy** (Home stats, games list, Review) = mean per-move score: best 100, good 85, inaccuracy 60, mistake 30, blunder 0 (`ACCURACY_WEIGHTS` in `game_utils.py`).

## Assisted Tracking

Games record `assisted = 1` when the player uses the **Show Best Next** hint button or **Take Back** while the game is active (not after game over). The after-the-fact buttons (**Show Best Last**, **Eval Last Move**, **Show Best Last Reply**, auto-eval highlights) do NOT count as assisted.

## DB Schema

```
games
  id            INTEGER PK
  pgn           TEXT
  result        TEXT        -- "1-0", "0-1", "1/2-1/2", "*"
  player_color  TEXT        -- "white" | "black"
  engine_elo    INTEGER
  engine        TEXT        -- "stockfish" (default) | "maia"
  played_at     DATETIME
  source        TEXT        -- game source; default "local" (reserved for future PGN import)
  analyzed      INTEGER     -- 0 | 1
  assisted      INTEGER     -- 0 | 1 (hint used during active play)

moves
  id            INTEGER PK
  game_id       INTEGER FK → games.id
  ply           INTEGER     -- 1-indexed
  uci           TEXT        -- e.g. "e2e4"
  san           TEXT        -- e.g. "e4"
  classification TEXT       -- best | good | inaccuracy | mistake | blunder
  eval_cp       FLOAT       -- centipawn evaluation after this move (white's POV, nullable)
  eval_loss_cp  FLOAT       -- raw centipawns lost vs the best move, 0–2000 (nullable, populated during analysis;
                            -- added to old DBs by init_db() migration). Classification uses win%, not this.
  best_uci       TEXT       -- Stockfish's best move UCI string at that position (populated during analysis, nullable)
  UNIQUE INDEX ux_moves_game_ply (game_id, ply)
```

## Testing

All tests require the venv activated and Stockfish binary available:
```bash
source .venv/bin/activate && pytest -v
```

Test files use `os.environ["DATABASE_URL"] = "sqlite://"` at module level (before backend imports) to redirect to an in-memory database.

## Hosting & Infrastructure

- **Domain**: chess.azimondia.com (subdomain of azimondia.com)
- **DNS / CDN**: Cloudflare (orange-cloud proxy, SSL/TLS mode: Full Strict)
- **Origin server**: GCP Compute Engine e2-micro (free tier VM)
- **SSL**: Cloudflare Origin Certificate — wildcard `*.azimondia.com` at `/etc/ssl/cloudflare/cert.pem` + `key.pem`
  - Same cert shared by all azimondia.com subdomains (recipes, chess, flight, etc.)
  - Each subdomain gets its own nginx `sites-available/` config file
- **App deployment**: nginx serves `frontend/dist/` as SPA, proxies `/api/` to uvicorn via unix socket
- **nginx config**: `deploy/nginx.conf` → `/etc/nginx/sites-available/chess`

## Phases (Roadmap)

- **Phase 1** ✅ COMPLETE: Play vs engine + save + post-game analysis + hint + best-reply + openings lessons
- **Phase 2**: Weakness detection across game history, dashboard
- **Phase 3**: Concept training (pick a topic, get drills from your games)
- **Phase 4**: Chess.com PGN import
