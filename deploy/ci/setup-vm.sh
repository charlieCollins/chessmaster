#!/bin/bash
# One-time VM setup for GitHub Actions deploys (run as root on the VM; idempotent).
#   sudo bash setup-vm.sh "<ssh public key of the GitHub deploy key>"
# Creates user chess-deploy whose only key is forced to /usr/local/sbin/chess-ci-ssh, which
# can only run /usr/local/sbin/chess-ci-deploy via sudo. Re-run after editing ssh-command.sh
# or deploy-root.sh (they are installed copies, not run from the git checkout).
set -euo pipefail
PUBKEY="${1:?public key}"
HERE="$(cd "$(dirname "$0")" && pwd)"
U=chess-deploy

id "$U" >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/$U --shell /bin/bash "$U"
install -o root -g root -m 0755 "$HERE/ssh-command.sh" /usr/local/sbin/chess-ci-ssh
install -o root -g root -m 0755 "$HERE/deploy-root.sh" /usr/local/sbin/chess-ci-deploy

install -d -o "$U" -g "$U" -m 0700 /var/lib/$U/.ssh
printf 'restrict,command="/usr/local/sbin/chess-ci-ssh" %s\n' "$PUBKEY" > /var/lib/$U/.ssh/authorized_keys
chown "$U:$U" /var/lib/$U/.ssh/authorized_keys
chmod 0600 /var/lib/$U/.ssh/authorized_keys

tmp=$(mktemp)
echo "$U ALL=(root) NOPASSWD: /usr/local/sbin/chess-ci-deploy" > "$tmp"
visudo -cf "$tmp" >/dev/null
install -o root -g root -m 0440 "$tmp" /etc/sudoers.d/chess-deploy
rm -f "$tmp"
echo "chess-deploy ready"
