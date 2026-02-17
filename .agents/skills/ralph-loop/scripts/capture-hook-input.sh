#!/usr/bin/env bash
set -euo pipefail

state_dir="${CODEX_PROJECT_DIR:-$(pwd)}/.ralph-loop"
mkdir -p "$state_dir"
cat > "$state_dir/hook-input.json"
