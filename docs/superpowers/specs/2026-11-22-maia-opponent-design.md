# Maia "human-like" opponent — design (short)

**Date:** 2026-11-22 · **Status:** approved in conversation

## Why
The user (chess.com 1300–1500) can't beat the app's "~1000" engine. Measured: the
label is right on Stockfish's own scale (Skill 0 scored 2.5/16 vs UCI_Elo 1320
≈ 1030), but Stockfish at low levels almost never hangs material and punishes
every slip — unlike human opponents. Maia (neural nets trained on human Lichess
games, one per rating band) makes human-style mistakes.

Spike results: lc0 v0.32.1 builds CPU-only (Eigen) in ~20 s; Maia at 1 node
plays in ~1–2 ms/move; Maia-1100 scored 6.5/16 vs app "~1000" and 7.5/16 vs
Stockfish 1320, and in self-play fell for a Fried Liver mate in 9.

## Goals
- Offer Maia 1100–1900 opponents; default to Maia 1300 when available.
- Keep the existing Stockfish levels as an "Engine" option.
- Games against Maia shouldn't repeat move-for-move.

## Non-goals / anti-goals
- Hints, live evals, analysis keep using full-strength Stockfish (accurate feedback).
- No hard dependency: the app must still work with Stockfish only.
- Don't make Maia "smarter" with search — 1 node is what makes it human-like.

## Approaches considered
1. **Maia as an additional opponent family (chosen)** — Stockfish levels stay; Maia
   levels added; feedback stays Stockfish.
2. Replace Stockfish opponents entirely — loses the strong-engine option.
3. Single Maia level — no saving; the extra weights are ~1.3 MB each.

## Design
- **Engine:** `MaiaEngine` in `backend/engine.py` drives lc0 over UCI
  (`--weights`, `--threads=1`, `go nodes 1`). Switching rating = switching
  weights file. Same `get_best_move(fen, ...)` interface, run inside an
  `EngineSlot` so crashes auto-restart.
- **Variety (builder's call):** read Maia's policy (lc0 `VerboseMoveStats`) and
  sample among moves with ≥ 5% probability, proportional to probability; fall
  back to Maia's top move if the policy can't be read.
- **Config:** `LC0_PATH` env → `lc0` on PATH; `MAIA_WEIGHTS_DIR` env →
  `~/.local/share/maia`. Maia is "available" only if the binary and the weights
  exist. Locally, `~/.local/bin/lc0` symlinks to the built binary.
- **Data:** `games.engine` TEXT, `"stockfish"` (default, migrates old rows) or
  `"maia"`. `engine_elo` keeps the level. Maia levels: 1100–1900 step 100.
- **API:** `POST /api/game` accepts `engine`; invalid combos → 422/400.
  `GET /api/engines` reports Maia availability + levels. Game/list responses
  include `engine`. PGN names the opponent ("Maia 1300" / "Stockfish 1000").
- **UI:** Play setup shows a "Human-like (Maia)" group first (default Maia 1300)
  and the Stockfish groups after; Maia hidden if unavailable. Opponent label
  everywhere reads "Maia 1300" / "Stockfish ~1000".
- **Tests:** Maia tests skip when lc0/weights are absent.
- **Deploy:** add "build lc0 + download Maia weights" to `TODO.md`.

## Left to the builder
Exact policy-parsing details, UI copy, test structure.
