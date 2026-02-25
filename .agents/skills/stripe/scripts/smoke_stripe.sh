#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MCP_FILE="$ROOT_DIR/.mcp.json"
URL="https://mcp.stripe.com"
STRICT_MODE="${STRICT_MODE:-0}"

if [[ ! -f "$MCP_FILE" ]]; then
  echo "ERROR: missing MCP config at $MCP_FILE" >&2
  exit 1
fi

if ! grep -q 'mcp.stripe.com' "$MCP_FILE"; then
  echo "ERROR: Stripe MCP URL not found in $MCP_FILE" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: curl is required for connectivity smoke test." >&2
  exit 1
fi

HTTP_CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$URL" || true)"
if [[ -z "$HTTP_CODE" || "$HTTP_CODE" == "000" ]]; then
  echo "WARN: could not reach $URL" >&2
  if [[ "$STRICT_MODE" == "1" ]]; then
    echo "ERROR: STRICT_MODE=1 and Stripe MCP endpoint not reachable." >&2
    exit 2
  fi
  echo "OK: config check passed (reachability skipped, non-strict mode)."
  exit 0
fi

echo "OK: Stripe integration smoke passed (HTTP $HTTP_CODE from $URL)."
