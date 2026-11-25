# TODO

## Hosting

- [x] Deployed (2026-11-23): 526 was nginx having no `chess` site (fell through to another site's cert).
      App + data + Maia are on the VM (`deploy/deploy.sh --first`).
- [x] Cloudflare Access: `chess.azimondia.com` added to the `azimondia-all` Access app (same policy and
      4 emails as recipes, 7-day session) on 2026-11-24; anonymous requests get a 302 to the login.
- [x] CI/CD: PRs to main run tests; merges deploy automatically (GitHub Actions + restricted deploy key), 2026-11-24.
- [ ] Optionally restrict origin 443 to Cloudflare IP ranges in the GCP firewall so the VM can't be hit directly
      (bypassing Cloudflare Access).

## Other follow-ups

- [ ] Per-user saved games (and Learn progress): today there's one shared history. Behind Cloudflare
      Access every request carries `Cf-Access-Authenticated-User-Email` — add a `user` column to
      games / learn tables, scope queries by it, and per-user `games/<user>/<id>.pgn` files.

- [ ] Chess corpus: decide what belongs in git. Today `corpus/raw/` (~360 MB), book
      scans (`corpus/books/*/images/`, 14 MB) and `corpus/puzzles/puzzles.sqlite` (2 GB)
      are git-ignored and rebuilt by `scripts/fetch_corpus.sh` + `scripts/build_corpus.py`.
      The text layers (~500 KB: book markdown, `diagrams.tsv`, games.pgn, topics, research)
      ARE committed for now — `diagrams.tsv` is hand-verified and can't be regenerated.
      Open question: keep generated markdown in git, or only the curated inputs + an index?
      Maybe commit a small curated puzzle set once the Learn drills pick theirs.
- [ ] Corpus: convert the other downloaded books (Lasker *Chess Strategy* 168 diagrams,
      Staunton *Blue Book* 78, Lasker *Chess and Checkers* + Philidor — text only) using
      the same pipeline (`scripts/diagram_ocr/`).
- [x] Learn area course: topic lessons, Capablanca drills, puzzles near your rating, review queue
      (`docs/superpowers/specs/2026-11-23-learn-course-design.md`).
- [ ] Daily trainer ("Today"): mix due reviews, weakest themes from `learn_attempts`, and positions
      from your own analysed game mistakes (deferred from the course by choice).
- [ ] Hosting: the 2 GB puzzle DB on the e2-micro — ship a trimmed quality subset instead.

- [ ] Resume in-progress games (today, leaving the Play page abandons the game;
      rows with `result = "*"` accumulate and are never shown)
- [ ] Switch test dependency from `httpx` to the client Starlette now recommends
      (`StarletteDeprecationWarning` in pytest output) — verify the package first
