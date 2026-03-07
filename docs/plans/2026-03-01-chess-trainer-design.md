# Chess Trainer — Design Document
_Date: 2026-03-01 · Last updated: 2026-03-07_

## Overview

A self-hosted chess trainer web app for a single user (intermediate ~800-1400). Built with FastAPI (Python) backend and React (Vite) frontend. Hosted at chess.azimondia.com on a GCP e2-micro VM behind Cloudflare.

## Tech Stack

- **Backend**: FastAPI + python-chess + Stockfish (system binary) + SQLite via SQLAlchemy
- **Frontend**: React (Vite + TypeScript) + react-chessboard v5 + chess.js
- **Engine**: Stockfish system binary, auto-detected via `shutil.which("stockfish")`

## Project Structure

```
chess/
├── backend/
│   ├── main.py           # FastAPI entrypoint, routes, lifespan
│   ├── engine.py         # Stockfish subprocess wrapper (ChessEngine class)
│   ├── game_utils.py     # reconstruct_board, generate_pgn, classify_move
│   ├── analysis.py       # Post-game analysis: classifies all moves with full-strength Stockfish
│   └── db.py             # SQLAlchemy models (Game, Move), init_db() with safe migrations
├── frontend/
│   └── src/
│       ├── App.tsx             # Routing shell (Play / Learn / Review pages)
│       └── pages/
│           ├── Home.tsx        # Dashboard: stats + completed game history
│           ├── Play.tsx        # Play vs engine (color/ELO, eval, hint, best-reply)
│           ├── Review.tsx      # Annotated replay: nav controls, analysis, accuracy score
│           └── Learn.tsx       # Lessons: Knights, Bishops, Rooks, Queens, Kings, Openings
│       └── data/
│           └── openings.ts     # 9 openings × 3-4 lines each (SAN sequences)
├── deploy/
│   ├── nginx.conf        # nginx config for chess.azimondia.com
│   ├── chess.service     # systemd unit (uvicorn)
│   ├── setup.sh          # First-time server setup
│   └── update.sh         # Deploy updates
└── tests/
```

## Feature Roadmap

### Phase 1 — Playable Engine Interface ✅ COMPLETE

- Interactive board (React) — play as white or black vs Stockfish
- Adjustable engine strength with two modes:
  - **Skill Level** (0–20): for sub-1320 ELO; uses move randomization, not calibrated
  - **UCI_Elo** (1320–3190): calibrated strength directly enforced by Stockfish
- Move validation via python-chess
- Real-time eval bar and last-move delta from Stockfish
- Game saved to SQLite on completion (PGN + move list + result)
- **Show Best** hint: shows best move on board (blue highlights); marks game as `assisted`
- **Best reply?**: shows engine's best response to your last move (green highlights); NOT `assisted`
- Post-game: move-by-move analysis (best/good/inaccuracy/mistake/blunder classification)
- Post-game review page with move navigation, accuracy %, estimated performance ELO
- Dashboard with win/loss stats and game history
- Learn section: piece-lesson tip cards + Openings hub (9 openings, 3–4 lines each, interactive board)

### Phase 2 — Weakness Analysis & Dashboard

- Aggregate analysis across all saved games
- Classify mistakes by: phase (opening/middlegame/endgame), piece type, pattern
- Dashboard: weak area scores, trends over time
- "Your biggest weakness" surfacing

### Phase 3 — Concept Training

- User picks a concept (Openings, Knights, Pawn Structure, Rook Endgames, etc.)
- Sub-mode A: pull positions from your own games where that concept was relevant + you erred
- Sub-mode B: puzzle drills from Lichess puzzle DB filtered by concept/theme

### Phase 4 — Game Import

- Upload PGN from Chess.com export
- Parse and analyze same as Phase 1 post-game analysis
- Feed into Phase 2 weakness detection

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/game` | Start new game (`player_color`, `engine_elo`) |
| GET | `/api/game/{id}` | Get game state + moves |
| POST | `/api/game/{id}/move` | Make a move (returns engine response + eval) |
| POST | `/api/game/{id}/resign` | Resign the game |
| POST | `/api/game/{id}/abort` | Abort game and delete from DB |
| POST | `/api/game/{id}/analyze` | Run post-game Stockfish analysis (~30s) |
| GET | `/api/game/{id}/hint` | Best move for current position; marks `assisted=1` during active play |
| POST | `/api/engine/best` | Best move for any FEN (`{fen}`); NOT tracked as assisted |
| GET | `/api/games` | List all completed games |
| GET | `/api/stats` | Aggregate win/loss/accuracy stats |

## Data Model (SQLite)

```
games
  id            INTEGER PK
  pgn           TEXT
  result        TEXT        -- "1-0", "0-1", "1/2-1/2", "*"
  player_color  TEXT        -- "white" | "black"
  engine_elo    INTEGER
  played_at     DATETIME
  source        TEXT        -- "local" | "import"
  analyzed      INTEGER     -- 0 = not analyzed, 1 = analyzed
  assisted      INTEGER     -- 0 = no hint used, 1 = hint used during active play

moves
  id            INTEGER PK
  game_id       INTEGER FK → games.id
  ply           INTEGER     -- 1-indexed
  uci           TEXT        -- e.g. "e2e4"
  san           TEXT        -- e.g. "e4"
  classification TEXT       -- best | good | inaccuracy | mistake | blunder
```

### Move Classification Thresholds

| Classification | Eval loss |
|----------------|-----------|
| Best | <= 0 cp |
| Good | 1–49 cp |
| Inaccuracy | 50–99 cp |
| Mistake | 100–199 cp |
| Blunder | >= 200 cp |

## Key Decisions

- **Cloudflare + GCP e2-micro**: hosted at chess.azimondia.com, wildcard Origin Cert (`*.azimondia.com`) shared with other subdomains
- **Stockfish system binary**: no bundled binary, installed via `apt install stockfish`
- **SQLite**: zero-config, file-based; at `/opt/chess/data/chess.db` in production
- **Unix socket**: uvicorn serves via `/run/chess/chess.sock`; nginx proxies `/api/` to it
- **Two engine instances**: `_engine_instance` (game engine, ELO-limited) and `_hint_engine` (always full strength) — share same Stockfish binary, avoid reconfiguring mid-game
- **Skill Level vs UCI_Elo**: values below 1320 use Skill Level (move randomization); values 1320+ use UCI_Elo (calibrated). Frontend shows which mode is active.
- **Assisted tracking**: hint during active play sets `assisted=1` on the game; best-reply and post-game hint do not
- **Chess.com import deferred**: Phase 4
