#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

env -u NEXT_PUBLIC_DCF_DASHBOARD_MODE PLAYWRIGHT_PORT="${PLAYWRIGHT_PORT:-3101}" \
  npm exec -- playwright test \
    --project=chromium \
    e2e/harness_smoke.pw.ts e2e/lab.pw.ts

env -u PLAYWRIGHT_BASE_URL NEXT_PUBLIC_DCF_DASHBOARD_MODE=demo \
  PLAYWRIGHT_PORT="${PLAYWRIGHT_DEMO_PORT:-3111}" \
  npm exec -- playwright test \
    --project=chromium \
    e2e/lab.pw.ts
