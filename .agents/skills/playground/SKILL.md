---
name: playground
description: Creates interactive HTML playgrounds — self-contained single-file explorers with visual controls, live preview, and prompt output with copy button
---

# playground

Creates interactive HTML playgrounds — self-contained single-file explorers with visual controls, live preview, and prompt output with copy button

Use this skill when the user asks for `playground` functionality, or requests workflows covered by this plugin.

## Source
- Claude plugin: `playground@55b58ec6e564`
- Local cache path: `/root/.claude/plugins/cache/claude-plugins-official/playground/55b58ec6e564`

## Available Components
- Top-level components: skills

## Execution Notes
- Prefer existing scripts/commands in this directory before re-implementing logic.
- If a behavior is not directly executable in Codex runtime, use the nearest equivalent toolchain and preserve intent.
- Source snapshots and manifests are stored under `references/claude-plugin-source/`.

## Claude Plugin Parity
- Port mode: functional parity adapted for Codex workflows.
- Merge mode: non-destructive; conflicting files are preserved under `claude_port/`.
