#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT=""
if command -v git >/dev/null 2>&1; then
  ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
fi
if [[ -z "$ROOT" ]]; then
  ROOT="$(cd "$SCRIPT_DIR/../../../../" && pwd)"
fi

echo "Repo root: $ROOT"
echo

if ! command -v rg >/dev/null 2>&1; then
  echo "rg not found; install ripgrep to use this script."
  exit 1
fi

echo "== Maintenance exports =="
rg -n "export const" "$ROOT/convex/maintenance" "$ROOT/convex/maintenance.ts" || true
echo

echo "== requireSyncToken usage =="
rg -n "requireSyncToken" "$ROOT/convex/maintenance" "$ROOT/convex/maintenance.ts" || true
echo

echo "== Duplicate scan/cleanup public entrypoints =="
rg -n "startDuplicateScan|stopDuplicateScan|startDuplicateCleanup|stopDuplicateCleanup" \
  "$ROOT/convex/maintenance" "$ROOT/convex/maintenance.ts" || true
echo

echo "== State tables =="
rg -n "duplicateScanState|duplicateCleanupState" "$ROOT/convex/schema.ts" "$ROOT/convex/maintenance" || true
