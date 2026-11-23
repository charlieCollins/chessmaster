# Research notes — what the evidence says about getting better at chess

Short, sourced notes that shape how the Learn area is built. Each note says what
the study found, how strong the evidence is, and what it means for this app.
Paper PDFs we could download are in `corpus/raw/papers/` (not redistributed);
see `corpus/SOURCES.md` for links.

| Note | One-line takeaway |
|------|-------------------|
| [burgoyne-2019-domain-experience.md](burgoyne-2019-domain-experience.md) | Serious solo study is the activity most tied to rating — and for adults 40+ it was the *only* one that predicted rating. |
| [chunking-and-templates.md](chunking-and-templates.md) | Skill = a large library of recognised patterns; you build it by seeing many real positions, not by memorising rules. |
| [practice-necessary-not-sufficient.md](practice-necessary-not-sufficient.md) | Practice matters a lot but doesn't explain everything; don't promise a fixed "hours → rating" curve. |
| [retrieval-and-spacing.md](retrieval-and-spacing.md) | General learning science: testing yourself and spacing reviews beat re-reading. (Not chess-specific.) |

## Design principles for the Learn area (derived from the notes)

1. **Solve, don't just read.** Every lesson ends in positions the learner has to
   solve on the board (book diagrams + Lichess puzzles of the same theme).
2. **Volume of real patterns.** Draw drills from the 6M real-game puzzles,
   grouped by theme, at the learner's rating band — many short reps.
3. **Spaced review.** A missed puzzle or a mistake from your own games comes
   back later (1 day, 3 days, 1 week…) until it's solved first try.
4. **Own games as material.** Mistakes flagged by analysis (`games/<id>.pgn`)
   become personal puzzles — serious study of one's own errors.
5. **Explain with the classics, drill with the database.** Capablanca supplies
   the "why" (principles, model endings); puzzles supply the reps.
