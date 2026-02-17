#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: start-ralph-loop.sh --max-iterations N --completion-promise TEXT --prompt PROMPT" >&2
}

max_iterations=""
completion_promise=""
prompt=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --max-iterations)
      max_iterations="${2:-}"
      shift 2
      ;;
    --completion-promise)
      completion_promise="${2:-}"
      shift 2
      ;;
    --prompt)
      prompt="${2:-}"
      shift 2
      ;;
    *)
      if [ -z "$prompt" ]; then
        prompt="$1"
        shift
      else
        shift
      fi
      ;;
  esac
 done

if [ -z "$max_iterations" ] || [ -z "$completion_promise" ] || [ -z "$prompt" ]; then
  usage
  exit 1
fi

if ! [[ "$max_iterations" =~ ^[0-9]+$ ]]; then
  echo "Error: --max-iterations must be an integer." >&2
  exit 1
fi

state_dir="${CODEX_PROJECT_DIR:-$(pwd)}/.ralph-loop"
mkdir -p "$state_dir"

echo -n "$prompt" > "$state_dir/prompt.txt"

created_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
cat > "$state_dir/state.json" <<STATE
{
  "active": true,
  "max_iterations": $max_iterations,
  "completion_promise": "$completion_promise",
  "iteration": 0,
  "prompt_path": ".ralph-loop/prompt.txt",
  "created_at": "$created_at"
}
STATE
