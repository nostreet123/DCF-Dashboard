#!/usr/bin/env bash
set -euo pipefail

hook_input="$(cat)"
state_dir="${CODEX_PROJECT_DIR:-$(pwd)}/.ralph-loop"
state_file="$state_dir/state.json"

if [ ! -f "$state_file" ]; then
  exit 0
fi

active="$(jq -r '.active // true' "$state_file")"
if [ "$active" != "true" ]; then
  exit 0
fi

max_iterations="$(jq -r '.max_iterations // 0' "$state_file")"
completion_promise="$(jq -r '.completion_promise // empty' "$state_file")"
iteration="$(jq -r '.iteration // 0' "$state_file")"
prompt_path="$(jq -r '.prompt_path // empty' "$state_file")"

if [ -z "$completion_promise" ] || [ -z "$prompt_path" ]; then
  exit 0
fi

transcript_path="$(echo "$hook_input" | jq -r '.transcript_path // empty')"

next_iteration=$((iteration + 1))
tmp_file="$(mktemp)"
jq --argjson iter "$next_iteration" '.iteration = $iter' "$state_file" > "$tmp_file"
mv "$tmp_file" "$state_file"

if [ -n "$transcript_path" ] && [ -f "$transcript_path" ]; then
  if grep -Fq "$completion_promise" "$transcript_path"; then
    exit 0
  fi
fi

if [ "$max_iterations" -gt 0 ] && [ "$next_iteration" -ge "$max_iterations" ]; then
  exit 0
fi

prompt="$(cat "$prompt_path")"
loop_mode="${RALPH_LOOP_MODE:-external}"

if [ "$loop_mode" = "external" ]; then
  codex_bin="${CODEX_CLI_BIN:-codex}"
  "$codex_bin" -p "$prompt"
  exit 0
fi

printf '{"continue": true, "suppressOutput": true}\n'
