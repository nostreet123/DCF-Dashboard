#!/usr/bin/env bash
# Push .env.vercel keys to linked Vercel project.
# Uses `npx vercel` (official CLI, not a pinned npm dependency).
# Production engine/sync secrets stay on production only — never preview/development.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${1:-$ROOT/.env.vercel}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — run ./scripts/export_vercel_env.sh first." >&2
  exit 1
fi

NON_SENSITIVE_KEYS="DCF_ENGINE_URL CONVEX_URL NEXT_PUBLIC_CONVEX_URL SEC_USER_AGENT"
PRODUCTION_ONLY_KEYS="DCF_ENGINE_INTERNAL_KEY DAMODARAN_SYNC_TOKEN"

is_non_sensitive() {
  local key="$1"
  for allowed in $NON_SENSITIVE_KEYS; do
    [[ "$key" == "$allowed" ]] && return 0
  done
  return 1
}

is_production_only() {
  local key="$1"
  for restricted in $PRODUCTION_ONLY_KEYS; do
    [[ "$key" == "$restricted" ]] && return 0
  done
  return 1
}

targets_for_key() {
  local key="$1"
  if is_production_only "$key"; then
    echo "production"
  else
    echo "production preview development"
  fi
}

flags_for() {
  local key="$1" target="$2"
  if is_non_sensitive "$key"; then
    echo "--no-sensitive"
  elif [[ "$target" == "development" ]]; then
    # development only accepts encrypted vars; --sensitive is invalid there
    echo ""
  else
    echo "--sensitive"
  fi
}

add_for_env() {
  local key="$1" value="$2" target="$3" flags="$4"
  # shellcheck disable=SC2086
  npx vercel env add "$key" "$target" --value "$value" --yes --force $flags
}

while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  key="${line%%=*}"
  value="${line#*=}"
  value="${value%\"}"
  value="${value#\"}"
  [[ -z "$key" || -z "$value" ]] && continue

  echo "Setting $key ..."
  for target in $(targets_for_key "$key"); do
    add_for_env "$key" "$value" "$target" "$(flags_for "$key" "$target")"
  done
done <"$ENV_FILE"

echo "Done. Production-only secrets were not pushed to preview/development."
echo "Redeploy with: npx vercel --prod"
