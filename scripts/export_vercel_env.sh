#!/usr/bin/env bash
# Export Vercel-ready env vars for production. Writes .env.vercel (gitignored).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/.env.vercel"
RENDER_OUT="$ROOT/.env.render"
# shellcheck source=lib/env_file.sh
source "$ROOT/scripts/lib/env_file.sh"

write_env_line() {
  local key="$1" value="$2"
  if [[ -z "$value" ]]; then
    printf '%s=\n' "$key"
    return
  fi
  local escaped="${value//\\/\\\\}"
  escaped="${escaped//\"/\\\"}"
  printf '%s="%s"\n' "$key" "$escaped"
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
elif [[ -z "${CONVEX_URL:-}" ]] || [[ "${CONVEX_URL:-}" == http://127.0.0.1:* ]] || [[ "${CONVEX_URL:-}" == http://localhost:* ]]; then
  echo "ERROR: Set CONVEX_PROD_URL or CONVEX_URL for cloud deployment." >&2
  exit 1
fi

{
  write_env_line DCF_ENGINE_URL "https://dcf-engine.onrender.com"
  write_env_line DCF_ENGINE_INTERNAL_KEY "$DCF_ENGINE_INTERNAL_KEY"
  write_env_line CONVEX_URL "$CONVEX_URL"
  write_env_line NEXT_PUBLIC_CONVEX_URL "$CONVEX_URL"
  write_env_line DAMODARAN_SYNC_TOKEN "${DAMODARAN_SYNC_TOKEN:-}"
  write_env_line SEC_USER_AGENT "${SEC_USER_AGENT:-}"
} >"$OUT"

echo "Wrote $OUT"
