#!/usr/bin/env bash
# Smoke-test iota production and triage 401s on /api/company/facts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IOTA_URL="${IOTA_URL:-https://dcf-dashboard-iota.vercel.app}"

echo "=== Iota production diagnostics ==="
echo "Target: $IOTA_URL"
echo

echo "--- Render engine (from .env.render) ---"
if [[ -f "$ROOT/.env.render" ]]; then
  python3 "$ROOT/scripts/verify_render_auth.py" || true
else
  echo "Skip: no .env.render — run ./scripts/export_render_env.sh first."
fi
echo

facts_body="$(mktemp)"
trap 'rm -f "$facts_body"' EXIT

facts_status="$(curl -sS -o "$facts_body" -w "%{http_code}" \
  "$IOTA_URL/api/company/facts?symbol=AAPL" || echo "000")"
echo "GET /api/company/facts?symbol=AAPL -> $facts_status"
if [[ -s "$facts_body" ]]; then
  head -c 200 "$facts_body"
  echo
fi
echo

search_status="$(curl -sS -o /dev/null -w "%{http_code}" \
  "$IOTA_URL/api/company/search?q=AAPL" || echo "000")"
echo "GET /api/company/search?q=AAPL -> $search_status"
echo

if [[ "$facts_status" == "200" ]]; then
  echo "OK: facts endpoint healthy."
  exit 0
fi

echo "Triage if facts != 200:"
echo "  1. ./scripts/export_render_env.sh && ./scripts/export_vercel_env.sh"
echo "  2. ./scripts/push_vercel_env.sh && npx vercel --prod --yes"
echo "  3. Render -> dcf-engine -> paste all values from .env.render, restart"
echo "  4. ./scripts/diagnose_iota.sh"
exit 1
