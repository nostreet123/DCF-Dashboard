#!/usr/bin/env bash
# Safe dotenv-style KEY=VALUE parsing (no shell execution).
set -euo pipefail

strip_unquoted_inline_comment() {
  local raw="$1"
  raw="${raw%%[[:space:]]#*}"
  raw="${raw%"${raw##*[![:space:]]}"}"
  printf '%s' "$raw"
}

parse_quoted_env_value() {
  local quote="$1"
  local raw="$2"
  local i=0 result="" ch next
  while (( i < ${#raw} )); do
    ch="${raw:i:1}"
    if [[ "$ch" == "\\" ]]; then
      next="${raw:i+1:1}"
      if [[ -n "$next" && ( "$next" == "$quote" || "$next" == "\\" ) ]]; then
        result+="$next"
        ((i += 2)) || true
        continue
      fi
    elif [[ "$ch" == "$quote" ]]; then
      break
    else
      result+="$ch"
    fi
    ((i += 1)) || true
  done
  printf '%s' "$result"
}

parse_env_value_raw() {
  local raw="$1"
  local trimmed="${raw#"${raw%%[![:space:]]*}"}"

  if [[ "$trimmed" == \"* ]]; then
    parse_quoted_env_value '"' "${trimmed:1}"
    return
  fi
  if [[ "$trimmed" == \'* ]]; then
    parse_quoted_env_value "'" "${trimmed:1}"
    return
  fi

  strip_unquoted_inline_comment "$raw"
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
    unset CONVEX_DEPLOYMENT
    if [[ -n "${CONVEX_DEPLOY_KEY:-}" ]] && ! convex_deploy_key_safe_for_prod; then
      unset CONVEX_DEPLOY_KEY
    fi
    "$@"
  )
}

convex_deploy_key_safe_for_prod() {
  local key="${CONVEX_DEPLOY_KEY:-}"
  [[ -z "$key" ]] && return 0
  [[ "$key" == preview:* ]] && return 1
  [[ "$key" =~ ^dev:.*\| ]] && return 1
  return 0
}

normalize_convex_url() {
  local url="$1"
  while [[ "$url" == */ ]]; do
    url="${url%/}"
  done
  printf '%s' "$url"
}

is_cloud_convex_url() {
  local url="$1"
  [[ "$url" =~ ^https://([A-Za-z0-9-]+\.)+convex\.cloud/?$ ]]
}
