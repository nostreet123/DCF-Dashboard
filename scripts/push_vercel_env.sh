#!/usr/bin/env bash
# Push .env.vercel keys to linked Vercel project (production target only).
# Uses `npx vercel` (official CLI, not a pinned npm dependency).
# Preview/development are intentionally skipped — production URLs/secrets must not
# land in partial preview configs (see docs/hosted-public-preview.md).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${1:-$ROOT/.env.vercel}"
# shellcheck source=lib/env_file.sh
source "$ROOT/scripts/lib/env_file.sh"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — run ./scripts/export_vercel_env.sh first." >&2
  exit 1
fi

NON_SENSITIVE_KEYS="DCF_ENGINE_URL CONVEX_URL NEXT_PUBLIC_CONVEX_URL SEC_USER_AGENT"
REQUIRED_KEYS="DCF_ENGINE_URL DCF_ENGINE_INTERNAL_KEY CONVEX_URL NEXT_PUBLIC_CONVEX_URL"

is_non_sensitive() {
  local key="$1"
  for allowed in $NON_SENSITIVE_KEYS; do
    [[ "$key" == "$allowed" ]] && return 0
  done
  return 1
}

is_required() {
  local key="$1"
  for required in $REQUIRED_KEYS; do
    [[ "$key" == "$required" ]] && return 0
  done
  return 1
}

flags_for() {
  local key="$1"
  if is_non_sensitive "$key"; then
    echo "--no-sensitive"
  else
    echo "--sensitive"
  fi
}

add_for_env() {
  local key="$1" value="$2" flags="$3"
  # stdin is the supported path for secret values (avoids --value CLI regressions)
  # shellcheck disable=SC2086
  printf '%s' "$value" | npx vercel env add "$key" production --yes --force $flags
}

while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  key="${line%%=*}"
  value="$(parse_env_value_raw "${line#*=}")"
  [[ -z "$key" ]] && continue

  if [[ -z "$value" ]]; then
    if is_required "$key"; then
      echo "ERROR: $key is empty in $ENV_FILE." >&2
      exit 1
    fi
    echo "WARN: Skipping $key (empty) — existing Vercel value unchanged." >&2
    continue
  fi

  echo "Setting $key (production) ..."
  add_for_env "$key" "$value" "$(flags_for "$key")"
done <"$ENV_FILE"

echo "Done. All keys pushed to production only (preview/development unchanged)."
echo "Redeploy with: npx vercel --prod"
