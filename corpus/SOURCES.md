# Chess corpus — sources

The raw corpus lives in `corpus/raw/` (git-ignored, ~360 MB). Rebuild it with
`scripts/fetch_corpus.sh` (skips files already present). Everything listed as
*used* is public domain / CC0 and may be adapted freely; papers are kept for
reference only and are not redistributed.

Downloaded 2026-11-23.

## Puzzles & openings (Lichess, CC0)

| Path | What | License |
|------|------|---------|
| `raw/lichess/lichess_db_puzzle.csv.zst` | ~6M rated, theme-tagged puzzles from real games. CSV columns: `PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags`. zstd-compressed (296 MB). | CC0 — "Database exports are released under the Creative Commons CC0 license" ([database.lichess.org](https://database.lichess.org/)) |
| `raw/lichess/openings/{a..e}.tsv` | 3,870 named opening lines: `eco`, `name`, `pgn`. | CC0 / public domain (see `raw/lichess/openings/README.md`, from [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings)) |

## Books (Project Gutenberg — public domain in the USA)

Fetched from the official mirror `gutenberg.pglaf.org` (www.gutenberg.org returned 503 to scripted downloads).
`*.txt` = plain text; `*-h.zip` = HTML edition with the original diagram images.

| ID | Book | Files | Notes |
|----|------|-------|-------|
| 33870 | José Raúl Capablanca, *Chess Fundamentals* (1921) | `33870.txt`, `33870-h.zip` | Backbone: endings → middlegame → openings; illustrative games. |
| 5614 | Edward Lasker, *Chess Strategy* | `5614-0.txt`, `5614-h.zip` | Openings, middlegame strategy, endgames; many diagrams. |
| 4913 | Edward Lasker, *Chess and Checkers: The Way to Mastership* (1918) | `4913.txt` | Beginner → intermediate course; text only (no HTML edition on the mirror). |
| 16377 | Howard Staunton et al., *The Blue Book of Chess* | `16377-0.txt`, `16377-h.zip` | Rules, openings, problems; 19th-century style. |
| 78804 | François-André Danican Philidor, *Studies of Chess* | `78804-0.txt` | Classic on pawn play ("pawns are the soul of chess"); old descriptive notation. |
| — | `raw/gutenberg/GUTINDEX.ALL` | | Gutenberg's master index (used to find the chess titles above). |

Skipped (not instructional or a variant): *Chess Generalship* (Young), *Chess History and Reminiscences* (Bird), the Kempelen automaton pamphlets, *War Chess*, *The Game of Chess* (a play).

## Research (reference only)

| Path / link | Paper | Use |
|-------------|-------|-----|
| `raw/papers/burgoyne2019-domain-experience.pdf` | Burgoyne, Nye, Macnamara, Charness, Hambrick (2019), *The impact of domain-specific experience on chess skill: Reanalysis of a key study*, American Journal of Psychology | Serious solo study is the experience most tied to skill; practice is necessary but not sufficient. |
| [PMC4361603](https://pmc.ncbi.nlm.nih.gov/articles/PMC4361603) *(not downloaded: PMC/Europe PMC timed out)* | Gobet et al., chunking/templates in chess expertise | Strength = recognised patterns (chunks/templates) → train by solving many positions. |
| [LSE eprint 102854](https://researchonline.lse.ac.uk/id/eprint/102854) *(no direct PDF)* | Campitelli & Gobet, *Deliberate practice: necessary but not sufficient* (2011) | Same conclusion; other factors matter too. |
| core.ac.uk 334073 / 333345 / 334186, Brunel 2438/1343 & 2438/822 *(403 / timed out)* | Gobet & Simon chunking-theory papers | Background on chunking theory. |
