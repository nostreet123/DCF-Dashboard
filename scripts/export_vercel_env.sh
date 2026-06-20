#!/usr/bin/env bash
# Export Vercel-ready env vars for production/preview. Writes .env.vercel (gitignored).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/.env.vercel"
RENDER_OUT="$ROOT/.env.render"

load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  set -a
  # shellcheck disable=SC1090
  source "$file"
  set +a
}

load_env_file "$ROOT/.env"
load_env_file "$ROOT/.env.local"

if [[ -f "$RENDER_OUT" ]]; then
  load_env_file "$RENDER_OUT"
fi

if [[ -z "${DCF_ENGINE_INTERNAL_KEY:-}" ]]; then
  echo "ERROR: DCF_ENGINE_INTERNAL_KEY missing. Run ./scripts/export_render_env.sh first." >&2
  exit 1
fi

if [[ -n "${CONVEX_PROD_URL:-}" ]]; then
  CONVEX_URL="$CONVEX_PROD_URL"
elif [[ "$CONVEX_URL" == http://127.0.0.1:* ]] || [[ "$CONVEX_URL" == http://localhost:* ]]; then
  echo "ERROR: Set CONVEX_PROD_URL or CONVEX_URL for cloud deployment." >&2
  exit 1
fi

cat >"$OUT" <<EOF
DCF_ENGINE_URL=https://dcf-engine.onrender.com
DCF_ENGINE_INTERNAL_KEY=${DCF_ENGINE_INTERNAL_KEY}
CONVEX_URL=${CONVEX_URL}
NEXT_PUBLIC_CONVEX_URL=${CONVEX_URL}
DAMODARAN_SYNC_TOKEN=${DAMODARAN_SYNC_TOKEN:-}
SEC_USER_AGENT=${SEC_USER_AGENT:-}
EOF

echo "Wrote $OUT"
