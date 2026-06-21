#!/usr/bin/env bash
# Export Render-ready env vars from .env and .env.local (local overrides).
# Writes .env.render — gitignored. Use Render dashboard "Add from .env" or paste keys.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/.env.render"

load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  set -a
  # shellcheck disable=SC1090
  source "$file"
  set +a
}

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

# Keep a stable engine key across re-exports when it only lives in .env.render.
if [[ -z "${DCF_ENGINE_INTERNAL_KEY:-}" && -f "$OUT" ]]; then
  # shellcheck disable=SC1090
  source "$OUT"
fi

detect_convex_prod_url() {
  local dash slug
  dash="$(npx convex dashboard --no-open --prod 2>/dev/null | tail -1 || true)"
  if [[ "$dash" =~ /d/([^[:space:]/]+) ]]; then
    slug="${BASH_REMATCH[1]}"
    echo "https://${slug}.convex.cloud"
  fi
}

detect_convex_prod_sync_token() {
  local line token
  line="$(npx convex env list --prod 2>/dev/null | grep '^DAMODARAN_SYNC_TOKEN=' | head -1 || true)"
  if [[ "$line" =~ ^DAMODARAN_SYNC_TOKEN=(.+)$ ]]; then
    token="${BASH_REMATCH[1]}"
    echo "$token"
  fi
}

if [[ -z "${DCF_ENGINE_INTERNAL_KEY:-}" ]]; then
  DCF_ENGINE_INTERNAL_KEY="$(openssl rand -hex 32)"
  echo "Generated DCF_ENGINE_INTERNAL_KEY (also save for Vercel/Next.js)." >&2
fi

if [[ -z "${SEC_USER_AGENT:-}" ]]; then
  echo "WARN: SEC_USER_AGENT missing in .env / .env.local" >&2
fi

if [[ -z "${CONVEX_URL:-}" ]] || [[ "$CONVEX_URL" == http://127.0.0.1:* ]] || [[ "$CONVEX_URL" == http://localhost:* ]]; then
  if [[ -n "${CONVEX_PROD_URL:-}" ]]; then
    echo "Using CONVEX_PROD_URL from env files: $CONVEX_PROD_URL" >&2
    CONVEX_URL="$CONVEX_PROD_URL"
  else
    prod_url="$(detect_convex_prod_url || true)"
    if [[ -n "$prod_url" ]]; then
      echo "Using Convex prod URL from CLI: $prod_url" >&2
      CONVEX_URL="$prod_url"
    else
      echo "ERROR: CONVEX_URL is local or empty and prod URL could not be detected." >&2
      echo "Set CONVEX_PROD_URL or log in with: npx convex dev" >&2
      exit 1
    fi
  fi
fi

if [[ -z "${CONVEX_URL:-}" ]]; then
  echo "ERROR: CONVEX_URL is required for Render deploy." >&2
  exit 1
fi

if [[ "$CONVEX_URL" == https://*.convex.cloud ]]; then
  prod_token="$(detect_convex_prod_sync_token || true)"
  if [[ -n "$prod_token" ]]; then
    if [[ -n "${DAMODARAN_SYNC_TOKEN:-}" && "$DAMODARAN_SYNC_TOKEN" != "$prod_token" ]]; then
      echo "WARN: Using Convex prod DAMODARAN_SYNC_TOKEN (local .env.local token differs)." >&2
    fi
    DAMODARAN_SYNC_TOKEN="$prod_token"
  elif [[ -n "${DAMODARAN_SYNC_TOKEN:-}" ]]; then
    echo "ERROR: Could not read DAMODARAN_SYNC_TOKEN from Convex prod, but .env.local has a token (likely dev)." >&2
    echo "Run: npx convex env list --prod" >&2
    exit 1
  else
    echo "ERROR: DAMODARAN_SYNC_TOKEN required for prod Convex URL." >&2
    echo "Set in Convex prod: npx convex env set DAMODARAN_SYNC_TOKEN ... --prod" >&2
    exit 1
  fi
elif [[ -z "${DAMODARAN_SYNC_TOKEN:-}" ]]; then
  echo "WARN: DAMODARAN_SYNC_TOKEN missing — set in .env.local or: npx convex env set DAMODARAN_SYNC_TOKEN ..." >&2
fi

{
  write_env_line PYTHONPATH python
  write_env_line SEC_USER_AGENT "${SEC_USER_AGENT:-}"
  write_env_line DCF_ENGINE_INTERNAL_KEY "$DCF_ENGINE_INTERNAL_KEY"
  write_env_line CONVEX_URL "$CONVEX_URL"
  write_env_line DAMODARAN_SYNC_TOKEN "${DAMODARAN_SYNC_TOKEN:-}"
} >"$OUT"

echo "Wrote $OUT"
echo "Copy DCF_ENGINE_INTERNAL_KEY to Next.js/Vercel as well."
