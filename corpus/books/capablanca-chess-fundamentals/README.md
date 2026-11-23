# Chess Fundamentals — José Raúl Capablanca (1921)

Source: Project Gutenberg #33870 (public domain in the USA). Built by `scripts/build_corpus.py` from `corpus/raw/gutenberg/33870/33870-h.zip`; don't edit the chapter or game files by hand — fix `diagrams.tsv` or the tools and rebuild.

## Diagrams

150 diagrams, each stored as a FEN in `diagrams.tsv` and shown in the text as a ```` ```fen ```` block. 131 are confirmed by replaying the book's own moves from them (game diagrams by replaying the whole game); 3 are illustrations rather than game positions; the rest were transcribed from the scans and reviewed by eye.

## Reading the original notation

The book uses **English descriptive notation**; this corpus adds modern algebraic
(SAN) next to it. Descriptive names a square from the *mover's* side: files are
named after the piece that starts there — Q R (a), Q Kt (b), Q B (c), Q (d), K (e),
K B (f), K Kt (g), K R (h) — and ranks count from the mover's own back rank. So
"P - K 4" is **e4** for White but **e5** for Black. "×" = captures, "ch" = check,
"Kt" = knight, "Castles" = O-O. Every move in the main lines was converted by
`corpus_tools/descriptive.py` and checked for legality against the position.

## Contents

- **01-chapter-i-first-principles-endings-middle-game-and-openings**
  - [1. Some Simple Mates](01-chapter-i-first-principles-endings-middle-game-and-openings.md#1-some-simple-mates) — diagrams 1, 2, 3, 4
  - [2. Pawn Promotion](01-chapter-i-first-principles-endings-middle-game-and-openings.md#2-pawn-promotion) — diagrams 5, 6
  - [3. Pawn Endings](01-chapter-i-first-principles-endings-middle-game-and-openings.md#3-pawn-endings) — diagrams 7, 8, 9, 10
  - [4. Some Winning Positions in the Middle-game](01-chapter-i-first-principles-endings-middle-game-and-openings.md#4-some-winning-positions-in-the-middle-game) — diagrams 11, 12, 13, 14, 15, 16
  - [5. Relative Value of the Pieces](01-chapter-i-first-principles-endings-middle-game-and-openings.md#5-relative-value-of-the-pieces)
  - [6. General Strategy of the Opening](01-chapter-i-first-principles-endings-middle-game-and-openings.md#6-general-strategy-of-the-opening) — diagrams 17
  - [7. Control of the Centre](01-chapter-i-first-principles-endings-middle-game-and-openings.md#7-control-of-the-centre) — diagrams 18
  - [8. Traps](01-chapter-i-first-principles-endings-middle-game-and-openings.md#8-traps) — diagrams 19, 20
- **02-chapter-ii-further-principles-in-end-game-play**
  - [9. A Cardinal Principle](02-chapter-ii-further-principles-in-end-game-play.md#9-a-cardinal-principle) — diagrams 21
  - [10. A Classical Ending](02-chapter-ii-further-principles-in-end-game-play.md#10-a-classical-ending) — diagrams 22, 23, 24
  - [11. Obtaining a Passed Pawn](02-chapter-ii-further-principles-in-end-game-play.md#11-obtaining-a-passed-pawn) — diagrams 25
  - [12. How to Find Out Which Pawn Will Be First to Queen](02-chapter-ii-further-principles-in-end-game-play.md#12-how-to-find-out-which-pawn-will-be-first-to-queen) — diagrams 26
  - [13. The Opposition](02-chapter-ii-further-principles-in-end-game-play.md#13-the-opposition) — diagrams 27, 28, 29, 30, 31
  - [14. The Relative Value of Knight and Bishop](02-chapter-ii-further-principles-in-end-game-play.md#14-the-relative-value-of-knight-and-bishop) — diagrams 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42
  - [15. How to Mate with a Knight and a Bishop](02-chapter-ii-further-principles-in-end-game-play.md#15-how-to-mate-with-a-knight-and-a-bishop) — diagrams 43, 44
  - [16. Queen Against Rook](02-chapter-ii-further-principles-in-end-game-play.md#16-queen-against-rook) — diagrams 45, 46, 47
- **03-chapter-iii-planning-a-win-in-middle-game-play**
  - [17. Attacking Without the Aid of Knights](03-chapter-iii-planning-a-win-in-middle-game-play.md#17-attacking-without-the-aid-of-knights) — diagrams 48, 49, 50
  - [18. Attacking with Knights As a Prominent Force](03-chapter-iii-planning-a-win-in-middle-game-play.md#18-attacking-with-knights-as-a-prominent-force) — diagrams 51, 52
  - [19. Winning by Indirect Attack](03-chapter-iii-planning-a-win-in-middle-game-play.md#19-winning-by-indirect-attack) — diagrams 53, 54
- **04-chapter-iv-general-theory**
  - [20. The Initiative](04-chapter-iv-general-theory.md#20-the-initiative)
  - [21. Direct Attacks En Masse](04-chapter-iv-general-theory.md#21-direct-attacks-en-masse) — diagrams 55, 56
  - [22. The Force of the Threatened Attack](04-chapter-iv-general-theory.md#22-the-force-of-the-threatened-attack) — diagrams 57, 58, 59, 60
  - [23. Relinquishing the Initiative](04-chapter-iv-general-theory.md#23-relinquishing-the-initiative) — diagrams 61, 62, 63, 64
  - [24. Cutting Off Pieces From the Scene of Action](04-chapter-iv-general-theory.md#24-cutting-off-pieces-from-the-scene-of-action) — diagrams 65, 66, 67
  - [25. A Player's Motives Criticised in a Specimen Game](04-chapter-iv-general-theory.md#25-a-players-motives-criticised-in-a-specimen-game) — diagrams 68, 69, 70, 71, 72, 73
- **05-chapter-v-end-game-strategy**
  - [26. The Sudden Attack From a Different Side](05-chapter-v-end-game-strategy.md#26-the-sudden-attack-from-a-different-side) — diagrams 74, 75, 76, 77
  - [27. The Danger of a Safe Position](05-chapter-v-end-game-strategy.md#27-the-danger-of-a-safe-position) — diagrams 78
  - [28. Endings with One Rook and Pawns](05-chapter-v-end-game-strategy.md#28-endings-with-one-rook-and-pawns) — diagrams 79, 80, 81, 82
  - [29. A Difficult Ending: Two Rooks and Pawns](05-chapter-v-end-game-strategy.md#29-a-difficult-ending-two-rooks-and-pawns) — diagrams 83, 84, 85, 86, 87
  - [30. Rook, Bishop and Pawns v. Rook, Knight and Pawns](05-chapter-v-end-game-strategy.md#30-rook-bishop-and-pawns-v-rook-knight-and-pawns) — diagrams 88
- **06-chapter-vi-further-openings-and-middle-games**
  - [31. Some Salient Points About Pawns](06-chapter-vi-further-openings-and-middle-games.md#31-some-salient-points-about-pawns) — diagrams 89, 90
  - [32. Some Possible Developments From a Ruy Lopez](06-chapter-vi-further-openings-and-middle-games.md#32-some-possible-developments-from-a-ruy-lopez) — diagrams 91, 92, 93, 94
  - [33. The Influence of a "hole"](06-chapter-vi-further-openings-and-middle-games.md#33-the-influence-of-a-hole) — diagrams 95, 96, 97

## Illustrative games (`games.pgn`)

- [Game 1: F. J. Marshall – J. R. Capablanca, Match, 1909 (1-0)](games/01-f-j-marshall-vs-j-r-capablanca-1909.md) — Queen's Gambit Declined
- [Game 2: A. K. Rubinstein – J. R. Capablanca, San Sebastian, 1911 (1-0)](games/02-a-k-rubinstein-vs-j-r-capablanca-1911.md) — Queen's Gambit Declined
- [Game 3: D. Janowski – J. R. Capablanca, Havana, 1913 (1-0)](games/03-d-janowski-vs-j-r-capablanca-1913.md) — Irregular Defence
- [Game 4: J. R. Capablanca – E. A. Snosko-Borovski, St. Petersburg, 1913 (0-1)](games/04-j-r-capablanca-vs-e-a-snosko-borovski-1913.md) — French Defence
- [Game 5: Dr. E. Lasker – J. R. Capablanca, St. Petersburg, 1914 (1-0)](games/05-dr-e-lasker-vs-j-r-capablanca-1914.md) — Ruy Lopez
- [Game 6: O. Chajes – J. R. Capablanca, Rice Memorial Tournament, 1916 (1-0)](games/06-o-chajes-vs-j-r-capablanca-1916.md) — French Defence
- [Game 7: J. R. Capablanca – A. Burn, San Sebastian, 1911 (1-0)](games/07-j-r-capablanca-vs-a-burn-1911.md) — Ruy Lopez
- [Game 8: J. Mieses – J. R. Capablanca, Berlin 1913 (0-1)](games/08-j-mieses-vs-j-r-capablanca-1913.md) — Centre Game
- [Game 9: J. R. Capablanca – R. Teichmann, Berlin, 1913 (1-0)](games/09-j-r-capablanca-vs-r-teichmann-1913.md) — Queen's Gambit Declined
- [Game 10: J. R. Capablanca – F. J. Marshall, St. Petersburg, 1914 (1-0)](games/10-j-r-capablanca-vs-f-j-marshall-1914.md) — Petroff Defence
- [Game 11: J. R. Capablanca – D. Janowski, St. Petersburg, 1914 (1-0)](games/11-j-r-capablanca-vs-d-janowski-1914.md) — Ruy Lopez
- [Game 12: J. R. Capablanca – O. Chajes, New York, 1918 (1-0)](games/12-j-r-capablanca-vs-o-chajes-1918.md) — French Defence
- [Game 13: J. S. Morrison – J. R. Capablanca, New York, 1918 (0-1)](games/13-j-s-morrison-vs-j-r-capablanca-1918.md) — Ruy Lopez
- [Game 14: F. J. Marshall – J. R. Capablanca, New York, 1918 (0-1)](games/14-f-j-marshall-vs-j-r-capablanca-1918.md) — Queen's Gambit Declined
