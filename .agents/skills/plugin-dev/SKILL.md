---
name: plugin-dev
description: Port of Codex skill `plugin-dev` to Codex skill format.
---

# plugin-dev

Port of Codex skill `plugin-dev` to Codex skill format.

Use this skill when the user asks for `plugin-dev` functionality, or requests workflows covered by this plugin.

## Source
- Codex skill: `plugin-dev@55b58ec6e564`
- Local cache path: `/root/.claude/plugins/cache/claude-plugins-official/plugin-dev/55b58ec6e564`

## Available Components
- Top-level components: agents, commands, skills

## Execution Notes
- Prefer existing scripts/commands in this directory before re-implementing logic.
- If a behavior is not directly executable in Codex runtime, use the nearest equivalent toolchain and preserve intent.
- Source snapshots and manifests are stored under `references/claude-plugin-source/`.

## Codex Plugin Parity
- Port mode: functional parity adapted for Codex workflows.
- Merge mode: non-destructive; conflicting files are preserved under `claude_port/`.
