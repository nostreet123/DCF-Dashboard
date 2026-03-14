#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

npm test -- test/convexConfig.test.ts test/playwrightWebServer.test.ts test/dcfEngine.test.ts

(
  cd python
  python -m pytest tests/test_engine_smoke.py tests/test_workbench_monte_carlo.py -q
)
