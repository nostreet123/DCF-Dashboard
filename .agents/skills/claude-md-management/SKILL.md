---
name: codex-md-management
description: Tools to maintain and improve CLAUDE.md files - audit quality, capture session learnings, and keep project memory current.
---

# codex-md-management

Tools to maintain and improve CLAUDE.md files - audit quality, capture session learnings, and keep project memory current.

Use this skill when the user asks for `codex-md-management` functionality, or requests workflows covered by this plugin.

## Source
- Codex skill: `codex-md-management@1.0.0`
- Local cache path: `/root/.claude/plugins/cache/claude-plugins-official/claude-md-management/1.0.0`

## Available Components
- Top-level components: commands, skills

## Execution Notes
- Prefer existing scripts/commands in this directory before re-implementing logic.
- If a behavior is not directly executable in Codex runtime, use the nearest equivalent toolchain and preserve intent.
- Source snapshots and manifests are stored under `references/claude-plugin-source/`.

## Codex Plugin Parity
- Port mode: functional parity adapted for Codex workflows.
- Merge mode: non-destructive; conflicting files are preserved under `claude_port/`.
