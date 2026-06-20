#!/usr/bin/env bash
# Push .env.vercel keys to linked Vercel project (production, preview, development).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${1:-$ROOT/.env.vercel}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — run ./scripts/export_vercel_env.sh first." >&2
  exit 1
fi

NON_SENSITIVE_KEYS="DCF_ENGINE_URL CONVEX_URL NEXT_PUBLIC_CONVEX_URL SEC_USER_AGENT"

is_non_sensitive() {
  local key="$1"
  for allowed in $NON_SENSITIVE_KEYS; do
    [[ "$key" == "$allowed" ]] && return 0
  done
  return 1
}

add_for_env() {
  local key="$1" value="$2" target="$3" flags="$4"
  npx vercel env add "$key" "$target" --value "$value" --yes --force $flags
}

while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  key="${line%%=*}"
  value="${line#*=}"
  value="${value%\"}"
  value="${value#\"}"
  [[ -z "$key" || -z "$value" ]] && continue

  if is_non_sensitive "$key"; then
    flags="--no-sensitive"
  else
    flags="--sensitive"
  fi

  echo "Setting $key ..."
  for target in production preview development; do
    add_for_env "$key" "$value" "$target" "$flags"
  done
done <"$ENV_FILE"

echo "Done. Redeploy with: npx vercel --prod"
