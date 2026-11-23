#!/usr/bin/env bash
# Deploy to chess.azimondia.com (GCP VM) from this machine.
#
#   deploy/deploy.sh                 code + frontend only (the usual update)
#   deploy/deploy.sh --puzzles       also upload the server-sized puzzle DB (puzzles-lite)
#   deploy/deploy.sh --engines       also upload lc0 + Maia weights
#   deploy/deploy.sh --data          also REPLACE the server's chess.db + games with this machine's
#                                    (the old server DB is kept as data/chess.db.bak-<time>)
#   deploy/deploy.sh --first         = --puzzles --engines --data
#
# The VM pulls the code from GitHub (main must be pushed); the frontend is built here
# because the VM has 1 GB of RAM and no Node.
set -euo pipefail

VM="${CHESS_VM:-instance-20260207-141914}"
ZONE="${CHESS_ZONE:-us-west1-b}"
REPO="https://github.com/charlieCollins/chessmaster.git"
BRANCH="${CHESS_BRANCH:-main}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

PUZZLES=0; ENGINES=0; DATA=0
for a in "$@"; do
    case "$a" in
        --puzzles) PUZZLES=1 ;;
        --engines) ENGINES=1 ;;
        --data) DATA=1 ;;
        --first) PUZZLES=1; ENGINES=1; DATA=1 ;;
        *) echo "unknown option $a" >&2; exit 2 ;;
    esac
done

cd "$ROOT"
# The server deploys what's on GitHub — make sure that's what we think it is.
remote_head=$(git ls-remote "$REPO" "refs/heads/$BRANCH" | cut -f1)
local_head=$(git rev-parse HEAD)
if [ "$remote_head" != "$local_head" ]; then
    echo "!! GitHub $BRANCH is ${remote_head:0:7}, local HEAD is ${local_head:0:7} — push (or check out $BRANCH) first." >&2
    exit 1
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir "$STAGE/chess-deploy"
OUT="$STAGE/chess-deploy"

echo "== building frontend"
(cd frontend && npm run build >/dev/null)
tar -czf "$OUT/dist.tgz" -C frontend dist

if [ "$PUZZLES" = 1 ]; then
    lite=corpus/puzzles/puzzles-lite.sqlite
    [ -f "$lite" ] || .venv/bin/python scripts/build_corpus.py puzzles-lite
    cp "$lite" "$OUT/puzzles.sqlite"
fi

if [ "$ENGINES" = 1 ]; then
    lc0="$(readlink -f "${LC0_PATH:-$(command -v lc0)}")"
    weights="${MAIA_WEIGHTS_DIR:-$HOME/.local/share/maia}"
    mkdir -p "$STAGE/engines/maia"
    cp "$lc0" "$STAGE/engines/lc0"
    cp "$weights"/maia-*.pb.gz "$STAGE/engines/maia/"
    tar -czf "$OUT/engines.tgz" -C "$STAGE/engines" .
fi

if [ "$DATA" = 1 ]; then
    mkdir -p "$STAGE/data"
    # Consistent snapshot even while the local app is running
    .venv/bin/python -c "import sqlite3,sys; s=sqlite3.connect('chess.db'); d=sqlite3.connect(sys.argv[1]); s.backup(d); d.close()" "$STAGE/data/chess.db"
    [ -d games ] && cp -r games "$STAGE/data/games"
    tar -czf "$OUT/data.tgz" -C "$STAGE/data" .
fi

echo "== uploading ($(du -sh "$OUT" | cut -f1))"
gcloud compute scp --zone "$ZONE" --recurse "$OUT" "$VM":~/ >/dev/null

echo "== updating code on the VM and installing"
gcloud compute ssh "$VM" --zone "$ZONE" --command "
set -e
sudo git -c safe.directory=/opt/chess -C /opt/chess fetch -q $REPO $BRANCH
sudo git -c safe.directory=/opt/chess -C /opt/chess reset -q --hard FETCH_HEAD
sudo bash /opt/chess/deploy/server.sh \$HOME/chess-deploy
"
echo "Deployed $(git rev-parse --short HEAD) → https://chess.azimondia.com"
