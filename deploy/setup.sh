#!/usr/bin/env bash
# Chess Trainer - GCE e2-micro server setup script
# Run as root (or with sudo) on the azimondia server.
# Assumes nginx and uv are already installed (shared with other sites).
set -euo pipefail

APP_DIR="/opt/chess"
APP_USER="chess"

echo "=== Chess Trainer Server Setup ==="

# -------------------------------------------------------
# 1. Install system packages
# -------------------------------------------------------
echo "Checking system packages..."
apt-get install -y -qq nginx stockfish nodejs npm

# -------------------------------------------------------
# 2. Install uv if not present
# -------------------------------------------------------
export PATH="$HOME/.local/bin:$PATH"
if ! command -v uv &> /dev/null; then
    echo "Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
fi

# -------------------------------------------------------
# 3. Create application user
# -------------------------------------------------------
if ! id "$APP_USER" &> /dev/null; then
    echo "Creating $APP_USER user..."
    useradd --system --shell /usr/sbin/nologin --home-dir "$APP_DIR" "$APP_USER"
    usermod -aG www-data "$APP_USER"
fi

cd "$APP_DIR"

git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

# -------------------------------------------------------
# 4. Install Python dependencies
# -------------------------------------------------------
echo "Installing Python dependencies..."
uv sync

# -------------------------------------------------------
# 5. Build React frontend
# -------------------------------------------------------
echo "Building frontend..."
cd "$APP_DIR/frontend"
npm install
npm run build
cd "$APP_DIR"

# -------------------------------------------------------
# 6. Create data directory and initialize database
# -------------------------------------------------------
mkdir -p "$APP_DIR/data"

if [ ! -f "$APP_DIR/data/chess.db" ]; then
    echo "Initializing database..."
    DATABASE_URL="sqlite:////opt/chess/data/chess.db" uv run python -c "
from backend.db import init_db
init_db()
"
fi

# -------------------------------------------------------
# 7. Set ownership
# -------------------------------------------------------
echo "Setting permissions..."
chown -R "$APP_USER:www-data" "$APP_DIR/data"
chmod 770 "$APP_DIR/data"

# -------------------------------------------------------
# 8. Install systemd service
# -------------------------------------------------------
echo "Installing systemd service..."
cp "$APP_DIR/deploy/chess.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable chess
systemctl restart chess

# -------------------------------------------------------
# 9. Configure nginx
# -------------------------------------------------------
CERT="/etc/ssl/cloudflare/cert.pem"
KEY="/etc/ssl/cloudflare/key.pem"

cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/chess
ln -sf /etc/nginx/sites-available/chess /etc/nginx/sites-enabled/

if [ -f "$CERT" ] && [ -f "$KEY" ]; then
    echo "Configuring nginx..."
    nginx -t
    systemctl reload nginx
else
    echo ""
    echo "⚠️  Skipping nginx reload — SSL certs not found at $CERT"
    echo "    Then run: sudo nginx -t && sudo systemctl reload nginx"
    echo ""
fi

# -------------------------------------------------------
# 10. Done
# -------------------------------------------------------
echo ""
echo "=== Setup Complete ==="
echo ""
echo "Services running:"
systemctl --no-pager status chess --lines=0 || true
echo ""
echo "Test locally: curl --unix-socket /run/chess/chess.sock http://localhost/api/games"
echo ""
echo "=== Next Steps (manual, in Cloudflare dashboard) ==="
echo ""
echo "1. DNS: Ensure A-record for chess.azimondia.com points to this server's external IP"
echo "2. SSL: Set SSL/TLS encryption mode to 'Full (Strict)'"
echo ""
