#!/usr/bin/env bash
# Server side of a deploy — run as root on the VM by deploy/deploy.sh (idempotent).
#   sudo bash /opt/chess/deploy/server.sh <staging dir>
# The staging dir holds what deploy.sh uploaded: dist.tgz, and optionally
# puzzles.sqlite, engines.tgz (lc0 + Maia weights), data.tgz (chess.db + games/).
set -euo pipefail

APP_DIR=/opt/chess
APP_USER=chess
STAGE="${1:?usage: server.sh <staging dir>}"

echo "== packages"
need=()
command -v /usr/games/stockfish >/dev/null || need+=(stockfish)
python3 -c "import venv, ensurepip" 2>/dev/null || need+=(python3-venv)
if [ ${#need[@]} -gt 0 ]; then
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${need[@]}"
fi

echo "== user"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --shell /usr/sbin/nologin --home-dir "$APP_DIR" --gid www-data "$APP_USER"

echo "== python deps"
[ -d "$APP_DIR/.venv" ] || python3 -m venv "$APP_DIR/.venv"
"$APP_DIR/.venv/bin/pip" install -q --upgrade pip
"$APP_DIR/.venv/bin/pip" install -q -r "$APP_DIR/requirements.txt"

echo "== frontend"
rm -rf "$APP_DIR/frontend/dist"
tar -xzf "$STAGE/dist.tgz" -C "$APP_DIR/frontend"

mkdir -p "$APP_DIR/data/games" "$APP_DIR/engines"

if [ -f "$STAGE/engines.tgz" ]; then
    echo "== engines (lc0 + Maia)"
    tar -xzf "$STAGE/engines.tgz" -C "$APP_DIR/engines"
    "$APP_DIR/engines/lc0" --help >/dev/null 2>&1 || echo "!! lc0 does not run on this machine — Maia will be hidden"
fi

if [ -f "$STAGE/puzzles.sqlite" ]; then
    echo "== puzzles"
    mv "$STAGE/puzzles.sqlite" "$APP_DIR/data/puzzles.sqlite"
fi

if [ -f "$STAGE/data.tgz" ]; then
    echo "== data (chess.db + games)"
    systemctl stop chess 2>/dev/null || true
    if [ -f "$APP_DIR/data/chess.db" ]; then
        cp -a "$APP_DIR/data/chess.db" "$APP_DIR/data/chess.db.bak-$(date +%Y%m%d-%H%M%S)"
    fi
    rm -f "$APP_DIR/data/chess.db-wal" "$APP_DIR/data/chess.db-shm"
    tar -xzf "$STAGE/data.tgz" -C "$APP_DIR/data"
fi

echo "== permissions"
chown -R "$APP_USER:www-data" "$APP_DIR/data"
chmod 770 "$APP_DIR/data"
chmod -R a+rX "$APP_DIR/frontend/dist" "$APP_DIR/engines" "$APP_DIR/corpus"

echo "== service"
cp "$APP_DIR/deploy/chess.service" /etc/systemd/system/chess.service
systemctl daemon-reload
systemctl enable -q chess
systemctl restart chess

echo "== nginx"
cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/chess
ln -sf /etc/nginx/sites-available/chess /etc/nginx/sites-enabled/chess
if ! nginx -t; then
    # Never leave a broken site enabled: the next reload would fail for every site on this VM
    rm -f /etc/nginx/sites-enabled/chess
    echo "!! nginx config test failed — chess site disabled again" >&2
    exit 1
fi
systemctl reload nginx

echo "== health"
for _ in $(seq 1 30); do
    if curl -sf --unix-socket /run/chess/chess.sock http://localhost/api/engines >/dev/null; then break; fi
    sleep 1
done
if ! curl -sf --unix-socket /run/chess/chess.sock http://localhost/api/engines; then
    echo "!! the app isn't answering — last log lines:" >&2
    journalctl -u chess -n 25 --no-pager >&2
    exit 1
fi
echo
rm -rf "$STAGE"
echo "== done"
