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
REQUIRED_KEYS="DCF_ENGINE_URL DCF_ENGINE_INTERNAL_KEY CONVEX_URL NEXT_PUBLIC_CONVEX_URL"

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

is_required() {
  local key="$1"
  for required in $REQUIRED_KEYS; do
    [[ "$key" == "$required" ]] && return 0
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

parse_env_value() {
  local raw="$1"
  if [[ "$raw" == \"*\" ]]; then
    raw="${raw:1:${#raw}-2}"
    raw="${raw//\\\"/\"}"
    raw="${raw//\\\\/\\}"
  fi
  printf '%s' "$raw"
}

add_for_env() {
  local key="$1" value="$2" target="$3" flags="$4"
  # stdin is the supported path for secret values (avoids --value CLI regressions)
  # shellcheck disable=SC2086
  printf '%s' "$value" | npx vercel env add "$key" "$target" --yes --force $flags
}

while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  key="${line%%=*}"
  value="$(parse_env_value "${line#*=}")"
  [[ -z "$key" ]] && continue

  if [[ -z "$value" ]]; then
    if is_required "$key"; then
      echo "ERROR: $key is empty in $ENV_FILE." >&2
      exit 1
    fi
    echo "WARN: Skipping $key (empty) — existing Vercel value unchanged." >&2
    continue
  fi

  echo "Setting $key ..."
  for target in $(targets_for_key "$key"); do
    add_for_env "$key" "$value" "$target" "$(flags_for "$key" "$target")"
  done
done <"$ENV_FILE"

echo "Done. Production-only secrets were not pushed to preview/development."
echo "Redeploy with: npx vercel --prod"
