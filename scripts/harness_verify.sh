#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

python_bin="${PYTHON:-python3}"
if [ -x "$repo_root/.venv/bin/python" ]; then
  python_bin="$repo_root/.venv/bin/python"
fi

echo "==> Repository invariants"
"$python_bin" scripts/check_repo_invariants.py

echo "==> JavaScript and TypeScript tests"
scripts/ensure_bun.sh bun test

echo "==> Python tests"
(
  cd python
  "$python_bin" -m pytest tests -q
)

echo "==> TypeScript typecheck"
npm run typecheck

echo "==> Convex typecheck"
scripts/ensure_bun.sh bunx convex typecheck

echo "==> Lint"
npm run lint

echo "==> Next.js build"
npm run build

echo "Harness verification passed."
