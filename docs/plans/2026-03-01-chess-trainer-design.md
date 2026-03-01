# Chess Trainer — Design Document
_Date: 2026-03-01_

## Overview

A self-hosted, local chess trainer web app for a single user (intermediate ~800-1400). Built with FastAPI (Python) backend and React (Vite) frontend. Runs entirely on localhost, no auth, no cloud.

## Tech Stack

- **Backend**: FastAPI + python-chess + stockfish (Python wrapper) + SQLite via SQLAlchemy
- **Frontend**: React (Vite) + react-chessboard + chess.js
- **Engine**: Stockfish binary (local, bundled in `stockfish/`)
- **Puzzle data**: Lichess puzzle CSV (free, CC license) — future phase

## Project Structure

```
chess-trainer/
├── backend/
│   ├── main.py           # FastAPI entrypoint
│   ├── engine.py         # Stockfish subprocess wrapper
│   ├── pgn_parser.py     # PGN parsing (future: Chess.com import)
│   ├── analysis.py       # Move classification, weakness detection
│   ├── training.py       # Concept drill logic
│   └── db.py             # SQLite models (games, moves, sessions)
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Dashboard.tsx   # Weak areas, recent games
│       │   ├── Play.tsx        # Play vs engine
│       │   ├── GameReview.tsx  # Annotated replay
│       │   └── Training.tsx    # Concept picker + drills
│       └── components/
│           └── Board.tsx       # react-chessboard wrapper
└── stockfish/            # Stockfish binary
```

## Feature Roadmap

### Phase 1 — Playable Engine Interface (START HERE)
- Interactive board (React) — play as white or black vs Stockfish
- Adjustable engine strength (ELO limiter)
- Move validation via chess.js
- Real-time eval bar from Stockfish
- Game saved to SQLite on completion (PGN + move list + result)
- Post-game: basic move-by-move analysis (blunder/mistake/inaccuracy classification)

### Phase 2 — Weakness Analysis & Rating
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
games          — id, pgn, result, played_at, source (local|import)
moves          — id, game_id, ply, uci, classification, eval_before, eval_after
training_sessions — id, concept, started_at, completed_at
```

## Key Decisions

- **No auth**: single user, localhost only
- **Stockfish local**: no API, no limits, full control over depth/time
- **SQLite**: zero-config, file-based, perfect for local solo use
- **Chess.com import deferred**: focus on playable loop first
