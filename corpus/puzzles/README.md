# Puzzles — Lichess puzzle database (CC0)

`puzzles.sqlite` (git-ignored, ~2 GB) holds 6,193,530 puzzles from real Lichess games, built 2026-11-23T21:28:41+00:00 from `corpus/raw/lichess/lichess_db_puzzle.csv.zst` by `.venv/bin/python scripts/build_corpus.py puzzles` (~2 minutes).

## Reading a puzzle

`fen` is the position *before* the opponent's last move. Moves[0] is the opponent's move — play it first; the solution is Moves[1:] (your move, their reply, your move…), all in UCI. `rating` is the puzzle's Glicko rating; `popularity` (−100…100) and `plays` measure quality.

## Tables

```sql
CREATE TABLE puzzles (
  id TEXT PRIMARY KEY, fen TEXT NOT NULL, moves TEXT NOT NULL,
  rating INTEGER NOT NULL, rating_dev INTEGER, popularity INTEGER, plays INTEGER,
  themes TEXT NOT NULL, game_url TEXT, openings TEXT
) WITHOUT ROWID;
CREATE TABLE puzzle_themes (
  theme TEXT NOT NULL, rating INTEGER NOT NULL, id TEXT NOT NULL,
  PRIMARY KEY (theme, rating, id)
) WITHOUT ROWID;
CREATE TABLE themes (theme TEXT PRIMARY KEY, count INTEGER NOT NULL);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
```

## Query

```python
from corpus_tools.puzzles import puzzles_for_theme
puzzles_for_theme('corpus/puzzles/puzzles.sqlite', 'fork', 1200, 1500,
                  limit=20, min_plays=1000, min_popularity=80)
```

## Themes

| Theme | Puzzles |
|---|---:|
| `endgame` | 3,109,325 |
| `short` | 3,106,594 |
| `middlegame` | 2,789,761 |
| `crushing` | 2,380,748 |
| `mate` | 1,969,315 |
| `advantage` | 1,776,458 |
| `long` | 1,610,518 |
| `oneMove` | 916,691 |
| `mateIn1` | 914,142 |
| `master` | 845,111 |
| `mateIn2` | 820,099 |
| `fork` | 795,016 |
| `kingsideAttack` | 541,607 |
| `veryLong` | 505,593 |
| `sacrifice` | 467,191 |
| `advancedPawn` | 385,402 |
| `defensiveMove` | 373,770 |
| `pin` | 371,586 |
| `rookEndgame` | 334,185 |
| `discoveredAttack` | 312,980 |
| `opening` | 294,444 |
| `deflection` | 268,263 |
| `quietMove` | 259,423 |
| `pawnEndgame` | 229,853 |
| `hangingPiece` | 225,428 |
| `attraction` | 224,811 |
| `backRankMate` | 209,223 |
| `mateIn3` | 199,578 |
| `exposedKing` | 186,491 |
| `promotion` | 149,233 |
| `skewer` | 137,063 |
| `discoveredCheck` | 108,795 |
| `queensideAttack` | 93,959 |
| `bishopEndgame` | 84,915 |
| `clearance` | 81,606 |
| `masterVsMaster` | 77,276 |
| `intermezzo` | 74,094 |
| `queenEndgame` | 72,458 |
| `trappedPiece` | 67,913 |
| `pillsburysMate` | 67,644 |
| `zugzwang` | 64,904 |
| `operaMate` | 63,940 |
| `knightEndgame` | 51,526 |
| `queenRookEndgame` | 46,811 |
| `attackingF2F7` | 45,447 |
| `capturingDefender` | 40,449 |
| `doubleCheck` | 32,410 |
| `mateIn4` | 29,225 |
| `smotheredMate` | 24,506 |
| `epauletteMate` | 22,646 |
| `interference` | 22,305 |
| `xRayAttack` | 22,102 |
| `equality` | 12,875 |
| `hookMate` | 10,807 |
| `cornerMate` | 10,780 |
| `enPassant` | 8,715 |
| `swallowstailMate` | 8,397 |
| `collinearMove` | 7,865 |
| `triangleMate` | 7,741 |
| `arabianMate` | 7,603 |
| `anastasiaMate` | 7,559 |
| `morphysMate` | 7,132 |
| `blindSwineMate` | 6,361 |
| `mateIn5` | 6,273 |
| `killBoxMate` | 5,440 |
| `dovetailMate` | 4,074 |
| `bodenMate` | 3,784 |
| `doubleBishopMate` | 3,778 |
| `superGM` | 3,241 |
| `castling` | 2,520 |
| `vukovicMate` | 2,445 |
| `balestraMate` | 1,364 |
| `underPromotion` | 1,139 |
