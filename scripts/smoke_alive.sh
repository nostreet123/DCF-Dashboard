#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

python_bin="${PYTHON:-python3}"
if [ -x "$repo_root/.venv/bin/python" ]; then
  python_bin="$repo_root/.venv/bin/python"
fi

scripts/ensure_bun.sh bun test test/convexConfig.test.ts test/playwrightWebServer.test.ts test/dcfEngine.test.ts

(
  cd python
  "$python_bin" -m pytest tests/test_engine_smoke.py tests/test_workbench_monte_carlo.py -q
)
