# TODO

## Get chess.azimondia.com working (deferred — local-only for now)

Status as of 2026-11-22: DNS is set up and proxied through Cloudflare, but the
site returns **Cloudflare error 526 (Invalid SSL certificate)** — Cloudflare
reaches the origin, but rejects the certificate it presents (SSL mode is
Full (Strict)).

### 1. Fix the 526 (origin certificate)

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

- [ ] Resume in-progress games (today, leaving the Play page abandons the game;
      rows with `result = "*"` accumulate and are never shown)
- [ ] Switch test dependency from `httpx` to the client Starlette now recommends
      (`StarletteDeprecationWarning` in pytest output) — verify the package first
