#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECK_VERSION_SCRIPT="$ROOT_DIR/scripts/check_version.sh"

if ! command -v semgrep >/dev/null 2>&1; then
  echo "ERROR: semgrep CLI is required. See https://semgrep.dev/docs/getting-started/quickstart" >&2
  exit 1
fi

if [[ -x "$CHECK_VERSION_SCRIPT" ]]; then
  "$CHECK_VERSION_SCRIPT"
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

cat > "$TMP_DIR/rule.yml" <<'RULE'
rules:
  - id: hardcoded-password
    patterns:
      - pattern: password = "..."
    message: hardcoded password
    severity: WARNING
    languages: [python]
RULE

cat > "$TMP_DIR/example.py" <<'PY'
password = "secret"
PY

OUTPUT_JSON="$TMP_DIR/output.json"
semgrep --config "$TMP_DIR/rule.yml" "$TMP_DIR/example.py" --json --quiet > "$OUTPUT_JSON"

if ! grep -q 'hardcoded-password' "$OUTPUT_JSON"; then
  echo "ERROR: semgrep ran but expected finding was not produced." >&2
  exit 1
fi

echo "OK: Semgrep integration smoke passed."
