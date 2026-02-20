#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STATE_DIR="${ROOT_DIR}/.codex/remote_qa"

DISPLAY_NUM="${DISPLAY_NUM:-99}"
XVFB_SCREEN="${XVFB_SCREEN:-1920x1080x24}"
VNC_PORT="${VNC_PORT:-5900}"
NOVNC_PORT="${NOVNC_PORT:-6080}"
NOVNC_WEB_DIR="${NOVNC_WEB_DIR:-/usr/share/novnc}"

NOVNC_USER="${NOVNC_USER:-qa}"
NOVNC_PASS="${NOVNC_PASS:-}"

mkdir -p "${STATE_DIR}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd Xvfb
require_cmd fluxbox
require_cmd x11vnc
require_cmd websockify

if [[ ! -d "${NOVNC_WEB_DIR}" ]]; then
  echo "noVNC web dir not found at ${NOVNC_WEB_DIR}" >&2
  echo "On Ubuntu you can install it with: apt-get install -y novnc" >&2
  exit 1
fi

AUTH_FILE="${STATE_DIR}/web_basic_auth.txt"
if [[ -z "${NOVNC_PASS}" ]]; then
  if [[ -f "${AUTH_FILE}" ]]; then
    NOVNC_PASS="$(cut -d: -f2- "${AUTH_FILE}")"
  else
    NOVNC_PASS="$(python3 - <<'PY'
import secrets
print(secrets.token_hex(16))
PY
)"
  fi
fi

echo "${NOVNC_USER}:${NOVNC_PASS}" >"${AUTH_FILE}"
chmod 600 "${AUTH_FILE}"

XVFB_LOG="${STATE_DIR}/xvfb.log"
FLUXBOX_LOG="${STATE_DIR}/fluxbox.log"
X11VNC_LOG="${STATE_DIR}/x11vnc.log"
WEBSOCKIFY_LOG="${STATE_DIR}/websockify.log"

XVFB_PID_FILE="${STATE_DIR}/xvfb.pid"
FLUXBOX_PID_FILE="${STATE_DIR}/fluxbox.pid"
X11VNC_PID_FILE="${STATE_DIR}/x11vnc.pid"
WEBSOCKIFY_PID_FILE="${STATE_DIR}/websockify.pid"

is_pid_running() {
  local pid_file="$1"
  if [[ ! -f "${pid_file}" ]]; then
    return 1
  fi
  local pid
  pid="$(cat "${pid_file}" 2>/dev/null || true)"
  if [[ -z "${pid}" ]]; then
    return 1
  fi
  if kill -0 "${pid}" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

if ! is_pid_running "${XVFB_PID_FILE}"; then
  nohup Xvfb ":${DISPLAY_NUM}" -screen 0 "${XVFB_SCREEN}" -ac +extension RANDR >"${XVFB_LOG}" 2>&1 &
  echo "$!" >"${XVFB_PID_FILE}"
fi

export DISPLAY=":${DISPLAY_NUM}"

if ! is_pid_running "${FLUXBOX_PID_FILE}"; then
  nohup fluxbox >"${FLUXBOX_LOG}" 2>&1 &
  echo "$!" >"${FLUXBOX_PID_FILE}"
fi

if ! is_pid_running "${X11VNC_PID_FILE}"; then
  nohup x11vnc \
    -display ":${DISPLAY_NUM}" \
    -rfbport "${VNC_PORT}" \
    -localhost \
    -forever \
    -shared \
    -nopw \
    >"${X11VNC_LOG}" 2>&1 &
  echo "$!" >"${X11VNC_PID_FILE}"
fi

if ! is_pid_running "${WEBSOCKIFY_PID_FILE}"; then
  nohup websockify \
    --web="${NOVNC_WEB_DIR}" \
    --web-auth \
    --auth-plugin=websockify.auth_plugins.BasicHTTPAuth \
    --auth-source="${NOVNC_USER}:${NOVNC_PASS}" \
    "0.0.0.0:${NOVNC_PORT}" \
    "localhost:${VNC_PORT}" \
    >"${WEBSOCKIFY_LOG}" 2>&1 &
  echo "$!" >"${WEBSOCKIFY_PID_FILE}"
fi

echo "DISPLAY=:${DISPLAY_NUM}"
echo "noVNC: http://<host>:${NOVNC_PORT}/vnc.html?autoconnect=1&resize=remote"
echo "Basic auth: ${NOVNC_USER} / ${NOVNC_PASS}"
