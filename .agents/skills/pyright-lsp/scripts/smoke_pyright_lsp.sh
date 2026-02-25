#!/usr/bin/env bash
set -euo pipefail

if command -v pyright >/dev/null 2>&1; then
  PYRIGHT_CMD=(pyright)
elif command -v npx >/dev/null 2>&1; then
  PYRIGHT_CMD=(npx --yes pyright)
else
  echo "ERROR: neither pyright nor npx is available." >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

cat > "$TMP_DIR/type_error.py" <<'PY'
x: int = "not-an-int"
PY

set +e
OUTPUT="$(${PYRIGHT_CMD[@]} "$TMP_DIR/type_error.py" 2>&1)"
STATUS=$?
set -e

if [[ $STATUS -eq 0 ]]; then
  echo "ERROR: pyright exited 0; expected a type error." >&2
  echo "$OUTPUT" >&2
  exit 1
fi

if ! grep -qi "error" <<<"$OUTPUT"; then
  echo "ERROR: pyright output did not contain expected error diagnostics." >&2
  echo "$OUTPUT" >&2
  exit 1
fi

echo "OK: Pyright LSP smoke passed."
