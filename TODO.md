# TODO

## Get chess.azimondia.com working (deferred — local-only for now)

Status as of 2026-11-22: DNS is set up and proxied through Cloudflare, but the
site returns **Cloudflare error 526 (Invalid SSL certificate)** — Cloudflare
reaches the origin, but rejects the certificate it presents (SSL mode is
Full (Strict)).

### 1. Fix the 526 (origin certificate)

> The Cloudflare MCP connector is authorized for Claude. In a session where it's
> signed in, it can check the Cloudflare side directly — zone SSL mode, the
> DNS record's target IP, issued Origin CA certificates (and their expiry), and
> set up the Access application in step 3. The origin-side checks below still
> need to be run on the VM itself.

Run on the GCP VM:

```bash
# Is the chess site actually enabled, and which cert does its server block use?
ls -l /etc/nginx/sites-enabled/
sudo nginx -T 2>/dev/null | grep -nE "server_name|ssl_certificate|listen"

# Is the cert file present, unexpired, and does it cover chess.azimondia.com?
sudo openssl x509 -in /etc/ssl/cloudflare/cert.pem -noout -subject -issuer -dates -ext subjectAltName

# What does the origin ACTUALLY serve for this hostname? (this is what Cloudflare sees)
echo | openssl s_client -connect 127.0.0.1:443 -servername chess.azimondia.com 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates -ext subjectAltName
```

Likely causes, in order:
- [ ] `/etc/nginx/sites-enabled/chess` missing or nginx not reloaded, so the
      request falls through to a default 443 server with a different/self-signed cert
- [ ] Origin certificate expired (Origin CA certs can be issued for as little as 7 days)
      or the files at `/etc/ssl/cloudflare/` are missing/unreadable by nginx
- [ ] DNS A record points at a different server than the one with the cert
- [ ] Cert's SANs don't include `*.azimondia.com` (should for a wildcard origin cert)

### 2. Deploy the app

- [ ] Merge the `audit-fixes` branch (deploy scripts were fixed there: no more
      `uv sync` without a pyproject, frontend now uses same-origin `/api`,
      `npm run build` passes)
- [ ] Clone/pull into `/opt/chess`, run `sudo deploy/setup.sh`
- [ ] Maia opponent (optional — app hides Maia if missing): build lc0 v0.32.1 CPU-only
      (`git clone --depth 1 --branch v0.32.1 https://github.com/LeelaChessZero/lc0.git`, then
      `meson setup build/release --buildtype=release -Dgtest=false -Dplain_cuda=false -Donnx=false -Dopenblas=false -Daccelerate=false -Dmetal=disabled -Dblas=true -Dnative_arch=false`
      and `meson compile -C build/release`), put `lc0` on PATH (or set `LC0_PATH` in `chess.service`),
      and `gh release download v1.0 --repo CSSLab/maia-chess --pattern "maia-1*.pb.gz"` into
      `MAIA_WEIGHTS_DIR` (default `~/.local/share/maia` of the service user)
- [ ] Verify: `curl --unix-socket /run/chess/chess.sock http://localhost/api/games`

### 3. Lock it down BEFORE it's reachable

The API has no auth: anyone could delete games, and every `/analyze` call
spawns a Stockfish process on a 1 GB e2-micro.

- [ ] Put the subdomain behind **Cloudflare Access** (Zero Trust → Access →
      Applications → self-hosted `chess.azimondia.com`, policy: your email only).
      No code changes needed.
- [ ] Optionally restrict origin 443 to Cloudflare IP ranges in the GCP firewall
      so the VM can't be hit directly.

## Other follow-ups

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
