#!/bin/bash
# Root side of a GitHub Actions deploy. Installed root-owned as /usr/local/sbin/chess-ci-deploy
# by deploy/ci/setup-vm.sh; the deploy user may run only this via sudo.
#   chess-ci-deploy <sha>         < dist.tgz   deploy that commit of GitHub main + this frontend build
#   chess-ci-deploy --disable-site             take the site offline (failed Access check)
set -euo pipefail
REPO=https://github.com/charlieCollins/chessmaster.git
APP=/opt/chess
git_() { git -c safe.directory="$APP" -C "$APP" "$@"; }

if [ "${1:-}" = "--disable-site" ]; then
    rm -f /etc/nginx/sites-enabled/chess
    nginx -t && systemctl reload nginx
    echo "chess site disabled"
    exit 0
fi

sha="${1:?sha}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "bad sha" >&2; exit 2; }

STAGE=$(mktemp -d /tmp/chess-ci.XXXXXX)
trap 'rm -rf "$STAGE"' ERR
head -c 100000000 > "$STAGE/dist.tgz"                 # frontend build from stdin, size-capped
tar -tzf "$STAGE/dist.tgz" >/dev/null                   # must be a readable tarball

git_ fetch -q "$REPO" main
# Only commits that are on GitHub's main can be deployed, whatever the caller sends.
git_ merge-base --is-ancestor "$sha" FETCH_HEAD || { echo "$sha is not on GitHub main" >&2; exit 3; }
git_ reset -q --hard "$sha"
echo "== deploying $(git_ log --oneline -1)"
bash "$APP/deploy/server.sh" "$STAGE"
