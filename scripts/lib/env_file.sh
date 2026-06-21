#!/usr/bin/env bash
# Safe dotenv-style KEY=VALUE parsing (no shell execution).
set -euo pipefail

parse_env_value_raw() {
  local raw="$1"
  if [[ "$raw" == \"*\" ]]; then
    raw="${raw:1:${#raw}-2}"
    raw="${raw//\\\"/\"}"
    raw="${raw//\\\\/\\}"
  elif [[ "$raw" == \'*\' ]]; then
    raw="${raw:1:${#raw}-2}"
    raw="${raw//\\\'/\'}"
    raw="${raw//\\\\/\\}"
  fi
  printf '%s' "$raw"
}

load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*export[[:space:]]+ ]] && line="${line#export }"
    line="${line#"${line%%[![:space:]]*}"}"
    [[ "$line" != *=* ]] && continue
    local key="${line%%=*}"
    key="${key%"${key##*[![:space:]]}"}"
    key="${key#"${key%%[![:space:]]*}"}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    local value
    value="$(parse_env_value_raw "${line#*=}")"
    export "${key}=${value}"
  done <"$file"
}

read_env_key_from_file() {
  local file="$1" want_key="$2"
  [[ -f "$file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" != "${want_key}="* ]] && continue
    parse_env_value_raw "${line#*=}"
    return 0
  done <"$file"
}

run_convex_prod_cli() {
  (
    unset CONVEX_DEPLOY_KEY CONVEX_DEPLOYMENT
    "$@"
  )
}
