#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

PLAYWRIGHT_PORT="${PLAYWRIGHT_PORT:-3101}" \
  npm exec -- playwright test \
    --project=chromium \
    e2e/harness_smoke.pw.ts
