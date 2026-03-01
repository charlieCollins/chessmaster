# Chess Trainer

Self-hosted chess trainer web app. FastAPI backend + React (Vite TS) frontend.
Runs entirely on localhost, single user, no auth.

## Quick Start

### One command (recommended)
```bash
./chess.sh          # start backend + frontend
./chess.sh stop     # stop both
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
- `frontend/src/App.tsx` — Routing shell (Play / Review pages)
- `frontend/src/pages/Play.tsx` — Interactive board, play vs engine, color/ELO selection, eval bar
- `frontend/src/pages/Review.tsx` — Annotated game replay with nav controls, run-analysis button

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/game` | Start new game (`player_color`, `engine_elo`) |
| GET | `/api/game/{id}` | Get game state + moves |
| POST | `/api/game/{id}/move` | Make a move (returns engine response + eval) |
| POST | `/api/game/{id}/resign` | Resign the game |
| POST | `/api/game/{id}/analyze` | Run post-game Stockfish analysis (slow ~30s) |

## Key Dependencies

- `python-chess` — board logic, FEN/PGN, move validation, UCI engine protocol
- Stockfish binary — auto-detected via `shutil.which("stockfish")`; falls back to `.venv/bin/stockfish`
- `react-chessboard` v5 — interactive board component (uses `options={{...}}` prop, not flat props)
- `chess.js` — client-side FEN reconstruction for move replay in Review page

## Eval Convention

Centipawns from White's perspective (positive = good for White).
Play page converts to player's POV for the eval bar display.

## Move Classification Thresholds

| Classification | Eval loss |
|----------------|-----------|
| Blunder | >= 200cp |
| Mistake | >= 100cp |
| Inaccuracy | >= 50cp |
| Good | < 50cp |

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

- **Phase 1** (current): Play vs engine + save + post-game analysis
- **Phase 2**: Weakness detection across game history, dashboard
- **Phase 3**: Concept training (pick a topic, get drills from your games)
- **Phase 4**: Chess.com PGN import
