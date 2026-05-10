#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MCP_FILE="$ROOT_DIR/.mcp.json"
STRICT_MODE="${STRICT_MODE:-0}"

if [[ ! -f "$MCP_FILE" ]]; then
  echo "ERROR: missing MCP config at $MCP_FILE" >&2
  exit 1
fi

if ! grep -q 'api.githubcopilot.com/mcp' "$MCP_FILE"; then
  echo "ERROR: github MCP URL not found in $MCP_FILE" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: gh CLI is required. Install from https://cli.github.com/" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "WARN: gh is not authenticated." >&2
  if [[ "$STRICT_MODE" == "1" ]]; then
    echo "ERROR: STRICT_MODE=1 and no GitHub auth detected." >&2
    exit 2
  fi
  echo "OK: config check passed (auth skipped, non-strict mode)."
  exit 0
fi

LOGIN="$(gh api user --jq '.login' 2>/dev/null || true)"
if [[ -z "$LOGIN" ]]; then
  echo "ERROR: authenticated but failed to query GitHub user via gh api" >&2
  exit 1
fi

echo "OK: GitHub integration smoke passed (user=$LOGIN)."
