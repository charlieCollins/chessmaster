# Chess Trainer — Design Document
_Date: 2026-03-01_

## Overview

A self-hosted chess trainer web app for a single user (intermediate ~800-1400). Built with FastAPI (Python) backend and React (Vite) frontend. Hosted at chess.azimondia.com on a GCP e2-micro VM behind Cloudflare.

## Tech Stack

- **Backend**: FastAPI + python-chess + Stockfish (system binary) + SQLite via SQLAlchemy
- **Frontend**: React (Vite + TypeScript) + react-chessboard + chess.js
- **Engine**: Stockfish system binary (`/usr/games/stockfish`), auto-detected via `shutil.which`

## Project Structure

```
chess/
├── backend/
│   ├── main.py           # FastAPI entrypoint, routes, lifespan
│   ├── engine.py         # Stockfish subprocess wrapper
│   ├── game_utils.py     # reconstruct_board, generate_pgn, classify_move
│   ├── analysis.py       # Post-game analysis: classifies all moves with full-strength Stockfish
│   └── db.py             # SQLAlchemy models (Game, Move), init_db()
├── frontend/
│   └── src/
│       ├── App.tsx             # Routing shell
│       └── pages/
│           ├── Play.tsx        # Play vs engine (color/ELO selection, eval bar)
│           └── Review.tsx      # Annotated replay with nav controls + analysis trigger
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
- Adjustable engine strength (ELO limiter)
- Move validation via python-chess
- Real-time eval bar from Stockfish
- Game saved to SQLite on completion (PGN + move list + result)
- Post-game: move-by-move analysis (blunder/mistake/inaccuracy/good classification)
- Post-game review page with move navigation

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

moves
  id            INTEGER PK
  game_id       INTEGER FK → games.id
  ply           INTEGER     -- 1-indexed
  uci           TEXT        -- e.g. "e2e4"
  san           TEXT        -- e.g. "e4"
  classification TEXT       -- blunder | mistake | inaccuracy | good
  eval_cp       REAL        -- centipawn eval after this move (white POV)
  best_uci      TEXT        -- what engine would have played
  eval_loss_cp  REAL        -- cp lost vs best move (always >= 0)
```

## Key Decisions

- **Cloudflare + GCP e2-micro**: hosted at chess.azimondia.com, wildcard Origin Cert (`*.azimondia.com`) shared with other subdomains
- **Stockfish system binary**: no bundled binary, installed via `apt install stockfish`
- **SQLite**: zero-config, file-based; at `/opt/chess/data/chess.db` in production
- **Unix socket**: uvicorn serves via `/run/chess/chess.sock`; nginx proxies `/api/` to it
- **Chess.com import deferred**: Phase 4
