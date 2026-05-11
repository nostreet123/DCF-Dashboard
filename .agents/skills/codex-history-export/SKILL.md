---
name: codex-history-export
description: This skill should be used when the user asks to "export Codex history", "full history", "group history by session", "redact tokens from history", or mentions `/root/.codex/history.jsonl` or `history.jsonl`.
version: 0.1.0
---

# Codex History Export

Export Codex CLI prompt history from local disk into readable text, with default best-effort redaction of common secret formats.

## What This Skill Is For

Use this skill to:
- Export full history as a chronological TSV-style log.
- Group history by `session_id`.
- Produce a deduplicated view for analysis.
- Redact tokens/keys that may have been pasted into chat and stored in CLI history.

## Workflow

1. Confirm the history file exists at `~/.codex/history.jsonl` (default).
2. Export to a file under `/tmp/` by default to avoid committing artifacts.
3. Keep redaction enabled unless explicitly asked for raw output, and review exports before sharing because no automated redactor can guarantee removal of every secret format.

## Commands

Run from this skill directory (`.agents/skills/codex-history-export/`):

- Full chronological export (redacted):
  - `python3 scripts/export_history.py --mode full --out /tmp/codex_full_history.txt`

- Grouped-by-session export (redacted):
  - `python3 scripts/export_history.py --mode grouped --out /tmp/codex_full_history_grouped.txt`

- Deduplicated export (redacted):
  - `python3 scripts/export_history.py --mode dedupe --out /tmp/codex_full_history_dedupe.txt`

- Raw export (no redaction):
  - `python3 scripts/export_history.py --mode full --out /tmp/codex_full_history_raw.txt --no-redact`

## Notes

- Do not modify `~/.codex/history.jsonl`; treat it as an append-only source of truth.
- Do not write exports into the repo unless explicitly requested (they may contain sensitive data).
- You can override the input history path via `--in /path/to/history.jsonl` or `CODEX_HISTORY_PATH=/path/to/history.jsonl`.
- You can filter to a single session with `--session <session_id>`.
- `--max-text-len 500` is useful for sharing snippets without dumping entire messages.
