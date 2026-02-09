# Ralph Loop Patterns

## Contents

1. In-process continuation
2. External re-run loop
3. Hook payload mapping
4. Troubleshooting and safety

## 1. In-process continuation

Use this pattern when the Stop hook can instruct Codex to continue the same session by returning a JSON control payload. The hook performs state checks, then prints a JSON response such as:

    {"continue": true, "suppressOutput": true}

Adjust the exact response shape to match the Codex hook contract observed in the captured payload. Use this pattern for fast, stateful loops that retain context in the same session.

## 2. External re-run loop

Use this pattern when the Stop hook cannot continue the same session. The hook starts a new Codex run from the stored prompt when the completion promise is missing. This pattern is slower but reliable across environments.

Minimal flow:

    - Read .ralph-loop/state.json
    - If completion promise found or max-iterations reached, exit
    - Otherwise call "$CODEX_CLI_BIN -p <prompt>" and exit

Prefer this pattern when the hook contract is unknown or lacks continuation controls.

## 3. Hook payload mapping

Capture the raw Stop hook input first, then map required fields into the stop hook script. Typical fields to extract include:

    - transcript_path (for completion promise search)
    - project_dir or cwd (for locating .ralph-loop state)
    - session_id (for logging, optional)

Store the captured payload in `.ralph-loop/hook-input.json` using `scripts/capture-hook-input.sh` and update `scripts/ralph-stop-hook.sh` accordingly.

## 4. Troubleshooting and safety

- Always set a conservative `max-iterations` and require a unique completion promise.
- Log each iteration in `.ralph-loop/state.json` and include a timestamp when debugging.
- If `jq` is missing, install it or rewrite the scripts to parse JSON via Python.
- If the loop keeps running, check that the completion promise is an exact match in the transcript.
