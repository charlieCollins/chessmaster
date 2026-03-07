# Build & Deploy Guide

## Local Development

```bash
./chess.sh           # start backend + frontend dev servers
./chess.sh stop      # stop them
./chess.sh restart   # stop then start (useful after code changes)
```

- Backend: http://localhost:8000
- Frontend: http://localhost:5174

`chess.sh` manages both processes together and streams their logs. It requires a venv and npm deps already installed (see First-Time Local Setup below).

### First-Time Local Setup

```bash
# Backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Frontend
cd frontend && npm install && cd ..
```

### Tests

```bash
source .venv/bin/activate && pytest -v
```

---

## Production Server (chess.azimondia.com)

The server is a GCP e2-micro VM. The app runs as a systemd service behind nginx + Cloudflare.

### First-Time Server Setup

SSH into the VM, then:

```bash
cd /opt/chess
sudo bash deploy/setup.sh
```

This will:
1. Install system packages (nginx, stockfish, nodejs, npm)
2. Create the `chess` system user
3. Create a Python venv and install dependencies
4. Build the React frontend (`frontend/dist/`)
5. Initialize the SQLite database at `/opt/chess/data/chess.db`
6. Install and start the `chess` systemd service (uvicorn)
7. Install the nginx config and reload nginx

After setup, the app is live at https://chess.azimondia.com. The service starts automatically on reboot.

### Deploying Updates

```bash
cd /opt/chess
bash deploy/update.sh
```

This pulls latest code, syncs Python deps, rebuilds the frontend, and restarts the service.

### Service Management

```bash
sudo systemctl status chess      # check status
sudo journalctl -u chess -f      # tail logs
sudo systemctl restart chess     # restart
```

### nginx

Config lives in `deploy/nginx.conf` and is copied to `/etc/nginx/sites-available/chess` by setup/update scripts.

```bash
sudo nginx -t                    # test config
sudo systemctl reload nginx      # apply changes
```

### SSL

Uses the wildcard Cloudflare Origin Certificate at `/etc/ssl/cloudflare/cert.pem` (covers all `*.azimondia.com` subdomains). Cloudflare SSL/TLS mode must be set to **Full (Strict)**.
