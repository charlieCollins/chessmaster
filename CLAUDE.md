# Chess Trainer

Self-hosted chess trainer web app. FastAPI backend + React (Vite TS) frontend.
Runs entirely on localhost, single user, no auth.

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
pip install -r requirements.txt   # first time only
uvicorn backend.main:app --reload

# Terminal 2 — frontend
cd frontend && npm install && npm run dev
```

### Tests
```bash
source .venv/bin/activate
pytest -v
```

## Architecture

- `backend/main.py` — FastAPI app, routes, lifespan (engine init/shutdown)
- `backend/engine.py` — Stockfish wrapper (`get_best_move`, `evaluate`, `full_strength` param)
- `backend/db.py` — SQLAlchemy models: Game, Move. SQLite at `chess.db` (env: `DATABASE_URL`)
- `backend/game_utils.py` — `reconstruct_board`, `generate_pgn`, `classify_move`
- `backend/analysis.py` — Post-game analysis: iterates all moves, classifies each with full-strength Stockfish
- `frontend/src/App.tsx` — Routing shell (Play / Learn / Review pages)
- `frontend/src/pages/Home.tsx` — Dashboard: win/loss stats + completed game history table
- `frontend/src/pages/Play.tsx` — Interactive board, play vs engine, color/ELO selection, eval bar, hint, best-reply
- `frontend/src/pages/Review.tsx` — Annotated game replay with nav controls, run-analysis button, accuracy score
- `frontend/src/pages/Learn.tsx` — Lesson pages (Knights, Bishops, Rooks, Queens, Kings, Openings hub + detail)
- `frontend/src/data/openings.ts` — Opening data: 9 openings × 3–4 lines each with SAN move sequences

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/game` | Start new game (`player_color`, `engine_elo`) |
| GET | `/api/game/{id}` | Get game state + moves |
| POST | `/api/game/{id}/move` | Make a move (returns engine response + eval) |
| POST | `/api/game/{id}/resign` | Resign the game |
| POST | `/api/game/{id}/abort` | Abort game and delete it from DB |
| POST | `/api/game/{id}/analyze` | Run post-game Stockfish analysis (~30s) |
| GET | `/api/game/{id}/hint` | Best move for current position (marks game `assisted=1`) |
| POST | `/api/engine/best` | Best move for any FEN (`{fen}`) — NOT tracked as assisted |
| GET | `/api/games` | List all completed games |
| GET | `/api/stats` | Aggregate win/loss/accuracy stats |

## Engine Strength Modes

Two modes depending on ELO value:

| Range | Mode | Notes |
|-------|------|-------|
| <1320 | `Skill Level` 0–20 | Move randomization; approximate ELOs only |
| 1320–3190 | `UCI_Elo` | Calibrated; directly enforced by Stockfish |

Skill Level mapping (`_SKILL_BY_ELO` in `engine.py`):
- 800 → Skill 0, 1000 → Skill 3, 1150 → Skill 6, 1200 → Skill 6, 1300 → Skill 9

**Important**: Skill Level evaluates at full strength then randomly degrades — inconsistent, not human-like. UCI_Elo is calibrated and consistent.

Two engine instances run at all times:
- `_engine_instance` — game engine, configures to selected ELO
- `_hint_engine` — always full-strength (`full_strength=True`), used for hint and best-reply endpoints

## Key Dependencies

- `python-chess` — board logic, FEN/PGN, move validation, UCI engine protocol
- Stockfish binary — auto-detected via `shutil.which("stockfish")`; falls back to `.venv/bin/stockfish`
- `react-chessboard` v5 — interactive board component (uses `options={{...}}` prop, not flat props)
- `chess.js` — client-side FEN reconstruction for move replay in Review and Learn pages

## Eval Convention

Centipawns from White's perspective (positive = good for White).
Play page converts to player's POV for display.

## Move Classification Thresholds

| Classification | Eval loss |
|----------------|-----------|
| Best | <= 0 cp (engine's top choice or better) |
| Good | 1–49 cp loss |
| Inaccuracy | 50–99 cp loss |
| Mistake | 100–199 cp loss |
| Blunder | >= 200 cp loss |

## Assisted Tracking

Games record `assisted = 1` when the player uses the **Show Best** hint button while the game is active (not after game over). The **Best reply?** button (shows engine's best response to your last move) does NOT count as assisted.

## DB Schema

```
games
  id            INTEGER PK
  pgn           TEXT
  result        TEXT        -- "1-0", "0-1", "1/2-1/2", "*"
  player_color  TEXT        -- "white" | "black"
  engine_elo    INTEGER
  played_at     DATETIME
  analyzed      INTEGER     -- 0 | 1
  assisted      INTEGER     -- 0 | 1 (hint used during active play)

moves
  id            INTEGER PK
  game_id       INTEGER FK → games.id
  ply           INTEGER     -- 1-indexed
  uci           TEXT        -- e.g. "e2e4"
  san           TEXT        -- e.g. "e4"
  classification TEXT       -- best | good | inaccuracy | mistake | blunder
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
