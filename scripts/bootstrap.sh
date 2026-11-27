#!/usr/bin/env bash
# Runs once when a Codespace is created. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v node >/dev/null || { echo "node is required"; exit 1; }
if ! command -v python3 >/dev/null; then
  sudo apt-get update -y && sudo apt-get install -y python3
fi
make check
