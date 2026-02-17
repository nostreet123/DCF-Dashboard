#!/usr/bin/env bash
set -euo pipefail

state_dir="${CODEX_PROJECT_DIR:-$(pwd)}/.ralph-loop"
state_file="$state_dir/state.json"

if [ -f "$state_file" ]; then
  rm -f "$state_file"
  echo "Ralph loop cancelled (state removed)."
else
  echo "No active Ralph loop state found."
fi
