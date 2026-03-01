#!/usr/bin/env bash
# Update script — run as your user, not root.
# Sudoers NOPASSWD handles the privileged commands (no password prompt).
set -euo pipefail

APP_DIR="/opt/chess"
cd "$APP_DIR"

git pull
uv sync

cd frontend && npm install && npm run build && cd ..

sudo cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/chess
sudo nginx -t
sudo systemctl daemon-reload
sudo systemctl reload nginx
sudo systemctl restart chess

echo "Updated and restarted."
