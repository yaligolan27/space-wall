#!/usr/bin/env bash
# One update cycle, meant to be launched by a scheduled Claude Code Routine in the cloud
# (or by anyone, anywhere the repo is checked out and the env vars are set).
# Same code path as the always-on runner, just one pass instead of a loop.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -d node_modules ]; then npm ci --silent; fi
TASKS="${*:-launches weather collect enrich intake}"
echo "space-wall cloud run · $(date -u +%FT%TZ) · tasks: $TASKS"
npm run --silent agent -- $TASKS
