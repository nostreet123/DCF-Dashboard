---
name: ralph-loop
description: This skill should be used when the user asks to "set up a Ralph loop", "create an autonomous loop", "add a stop hook that restarts Codex", "implement /ralph-loop", "run Codex until a completion promise", or mentions ralph-wiggum, stop hooks, max-iterations, or completion-promise for iterative Codex runs.
---

# Ralph Loop (Codex CLI)

## Purpose

Implement an autonomous Codex loop that re-runs a prompt until a completion promise appears or a max-iterations limit is reached. Use a Stop hook to intercept session exit, update loop state, and decide whether to continue. Use short, explicit promises and deterministic limits to avoid runaway execution.

## Core Inputs (define explicitly)

- `--max-iterations N`: Maximum number of loop attempts before stopping.
- `--completion-promise TEXT`: Exact string that signals completion. Prefer a short, unique token (e.g., `COMPLETE_OK`).
- `PROMPT`: The base prompt to re-run.

## Workflow

1. Capture the hook payload once to learn the available JSON fields.
   - Run `scripts/capture-hook-input.sh` as a temporary Stop hook.
   - Inspect the saved payload and map fields used by `scripts/ralph-stop-hook.sh`.

2. Initialize loop state and prompt storage.
   - Run `scripts/start-ralph-loop.sh --max-iterations N --completion-promise TEXT --prompt "..."`.
   - Store state in `.ralph-loop/state.json` and the prompt in `.ralph-loop/prompt.txt`.
   - Add `.ralph-loop/` to `.gitignore` if the repository tracks the working tree.

3. Install a Stop hook that calls `scripts/ralph-stop-hook.sh`.
   - For plugin-based setups, place hooks configuration alongside the plugin (see `examples/hooks.json`).
   - For project-local setups, place hooks configuration in the project hook file used by Codex CLI.

4. Run Codex once with the prompt.
   - The stop hook handles the loop logic after the first run.

5. Cancel the loop when required.
   - Run `scripts/cancel-ralph-loop.sh` to deactivate the loop and remove state.

## Loop Control Contract (recommended)

- Treat `--max-iterations` as mandatory and conservative.
- Treat `--completion-promise` as mandatory and unique.
- Prefer explicit completion promises in the prompt, such as:
  - "Output COMPLETE_OK only when all tasks and tests pass."

## Resources

### Scripts

- `scripts/start-ralph-loop.sh`: Initialize loop state and prompt.
- `scripts/ralph-stop-hook.sh`: Stop-hook handler that enforces max-iterations and completion promise.
- `scripts/cancel-ralph-loop.sh`: Disable loop state.
- `scripts/capture-hook-input.sh`: Log hook payloads for mapping fields.

### Examples

- `examples/hooks.json`: Minimal Stop hook wiring.
- `examples/state.json`: State file shape used by the scripts.

### References

- `references/patterns.md`: Loop patterns (in-process continuation vs external re-run), plus troubleshooting notes.

## Validation

- Trigger a short loop with `--max-iterations 2` and a completion promise that is not output.
- Confirm the loop stops after two attempts and the state file reflects the final iteration.
- Trigger a loop with a completion promise that is output and confirm the loop exits early.


## Codex Plugin Parity
- Source plugin: `ralph-loop@55b58ec6e564` from local Codex cache
- Merge mode: non-destructive (conflicts in `claude_port/`)
