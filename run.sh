#!/usr/bin/env sh
# One-command launch: runs the invariant suite, then serves and opens the instrument.
set -e
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "Node.js >= 18 is required (https://nodejs.org)"; exit 1; }
node --test
exec node server.mjs --open "$@"
