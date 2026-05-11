#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bun_version="${BUN_VERSION:-1.3.10}"
local_bun_home="$repo_root/.bun-home"
local_bun="$local_bun_home/bin/bun"

if command -v bun >/dev/null 2>&1; then
  exec "$@"
fi

if [ ! -x "$local_bun" ]; then
  echo "Bun not found on PATH; installing Bun $bun_version into $local_bun_home" >&2
  mkdir -p "$local_bun_home"
  installer_home="$local_bun_home/install-home"
  mkdir -p "$installer_home"
  curl -fsSL https://bun.sh/install | BUN_INSTALL="$local_bun_home" HOME="$installer_home" bash -s "bun-v$bun_version"
fi

export BUN_INSTALL="$local_bun_home"
export PATH="$local_bun_home/bin:$PATH"

exec "$@"
