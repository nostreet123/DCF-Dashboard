#!/usr/bin/env bash
set -euo pipefail

if command -v tsc >/dev/null 2>&1; then
  TSC_CMD=(tsc)
elif command -v npx >/dev/null 2>&1; then
  TSC_CMD=(npx --yes tsc)
else
  echo "ERROR: neither tsc nor npx is available." >&2
  exit 1
fi

if command -v typescript-language-server >/dev/null 2>&1; then
  TSLS_CMD=(typescript-language-server)
elif command -v npx >/dev/null 2>&1; then
  TSLS_CMD=(npx --yes typescript-language-server)
else
  echo "ERROR: neither typescript-language-server nor npx is available." >&2
  exit 1
fi

"${TSLS_CMD[@]}" --version >/dev/null 2>&1 || {
  echo "ERROR: failed to execute typescript-language-server --version" >&2
  exit 1
}

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

cat > "$TMP_DIR/tsconfig.json" <<'JSON'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "strict": true,
    "noEmit": true
  },
  "include": ["index.ts"]
}
JSON

cat > "$TMP_DIR/index.ts" <<'TS'
const x: number = "not-a-number";
TS

set +e
OUTPUT="$(${TSC_CMD[@]} -p "$TMP_DIR" --pretty false 2>&1)"
STATUS=$?
set -e

if [[ $STATUS -eq 0 ]]; then
  echo "ERROR: tsc exited 0; expected a type error." >&2
  echo "$OUTPUT" >&2
  exit 1
fi

if ! grep -q 'TS' <<<"$OUTPUT"; then
  echo "ERROR: tsc output missing TypeScript diagnostic codes." >&2
  echo "$OUTPUT" >&2
  exit 1
fi

echo "OK: TypeScript LSP smoke passed."
