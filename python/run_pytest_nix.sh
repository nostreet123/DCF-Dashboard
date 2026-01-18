#!/usr/bin/env bash
set -euo pipefail

# Nix-built Python wheels (e.g. numpy/pandas) may require runtime libs that are
# not on the default loader path in this environment. Provide them via Nix.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

exec nix shell nixpkgs#gcc nixpkgs#zlib --command bash -lc '
  set -euo pipefail
  libstd=$(g++ -print-file-name=libstdc++.so.6)
  zlib=$(ls -1 /nix/store/*-zlib-*/lib/libz.so.1 | head -n 1)
  export LD_LIBRARY_PATH="$(dirname "$libstd"):$(dirname "$zlib"):${LD_LIBRARY_PATH-}"
  "'"$ROOT_DIR"'/.venv/bin/python" -m pytest -q
'
