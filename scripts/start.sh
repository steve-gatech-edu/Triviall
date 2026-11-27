#!/usr/bin/env bash
# Runs on every Codespace start. Idempotent: does nothing if the server is already up.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-8080}"
if (echo > "/dev/tcp/127.0.0.1/${PORT}") 2>/dev/null; then
  echo "Triviall is already running on port ${PORT}."
else
  nohup python3 -m http.server "${PORT}" --bind 0.0.0.0 > /tmp/triviall-serve.log 2>&1 &
  echo "Started Triviall on port ${PORT}."
fi
# Best effort, and unverified (spike check A1): portsAttributes cannot set visibility, so try the gh CLI.
# The before state and the attempt are saved so scripts/spike.mjs can record what actually happened.
if [ -n "${CODESPACE_NAME:-}" ] && command -v gh >/dev/null; then
  gh codespace ports -c "${CODESPACE_NAME}" --json sourcePort,visibility > /tmp/triviall-ports-before.json 2>/dev/null || echo '[]' > /tmp/triviall-ports-before.json
  if err=$(gh codespace ports visibility "${PORT}:public" -c "${CODESPACE_NAME}" 2>&1); then
    echo "gh set port ${PORT} public: ok" > /tmp/triviall-visibility-attempt.txt
  else
    echo "gh set port ${PORT} public: failed (${err:0:120})" > /tmp/triviall-visibility-attempt.txt
    echo "Could not make port ${PORT} public. Set it in the Ports tab (Visibility: Public) so phones can load it."
  fi
  echo "Lab: https://${CODESPACE_NAME}-${PORT}.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}/lab/"
fi
# Record spike results in the background so startup is not blocked (takes about 20 seconds).
nohup node scripts/spike.mjs > /tmp/triviall-spike.log 2>&1 &
echo "Recording spike results to docs/spike-results.md in the background."
