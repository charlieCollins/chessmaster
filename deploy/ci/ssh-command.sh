#!/bin/bash
# Forced command for the GitHub Actions deploy key (authorized_keys "command=").
# Installed root-owned as /usr/local/sbin/chess-ci-ssh by deploy/ci/setup-vm.sh.
# The key can do exactly two things, whatever the client asks for:
#   deploy <40-hex commit sha>   (frontend dist.tgz on stdin)
#   disable-site                 (take chess.azimondia.com offline)
set -euo pipefail
read -r verb arg extra <<<"${SSH_ORIGINAL_COMMAND:-}"
case "$verb" in
    deploy)
        [[ "${arg:-}" =~ ^[0-9a-f]{40}$ && -z "${extra:-}" ]] || { echo "usage: deploy <sha>" >&2; exit 2; }
        exec sudo -n /usr/local/sbin/chess-ci-deploy "$arg" ;;
    disable-site)
        exec sudo -n /usr/local/sbin/chess-ci-deploy --disable-site ;;
    *)
        echo "allowed: deploy <sha> | disable-site" >&2; exit 2 ;;
esac
