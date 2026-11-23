# Hanging and trapped pieces

*Tactics* · [all topics](README.md)

The most common way games are decided below 1500: free material and pieces with no squares.

## Key ideas

- Before every move ask: what does their last move attack, and what did it stop defending?
- A piece is trapped when every square it can go to is attacked — bishops on a7/h7 and knights on the rim are classic victims.

## Practice puzzles (Lichess, CC0)

Bands count puzzles with ≥ 1000 plays and popularity ≥ 80; query them with `corpus_tools.puzzles.puzzles_for_theme`.

| Theme | All puzzles | 800–1199 | 1200–1599 | 1600–1999 |
|---|---:|---:|---:|---:|
| `hangingPiece` | 225,428 | 11,425 | 22,144 | 17,878 |
| `trappedPiece` | 67,913 | 1,793 | 12,310 | 12,702 |

## How to practise

Fast `hangingPiece` sets (aim for speed), then `trappedPiece`. Cross-check against your own game blunders.
