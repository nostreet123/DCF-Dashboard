#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STATE_DIR="${ROOT_DIR}/.codex/remote_qa"

kill_from_pid() {
  local pid_file="$1"
  if [[ ! -f "${pid_file}" ]]; then
    return 0
  fi
  local pid
  pid="$(cat "${pid_file}" 2>/dev/null || true)"
  if [[ -z "${pid}" ]]; then
    rm -f "${pid_file}"
    return 0
  fi
  if kill -0 "${pid}" >/dev/null 2>&1; then
    kill "${pid}" >/dev/null 2>&1 || true
  fi
  rm -f "${pid_file}"
}

kill_from_pid "${STATE_DIR}/websockify.pid"
kill_from_pid "${STATE_DIR}/x11vnc.pid"
kill_from_pid "${STATE_DIR}/fluxbox.pid"
kill_from_pid "${STATE_DIR}/xvfb.pid"

echo "Stopped remote QA display/novnc services."
