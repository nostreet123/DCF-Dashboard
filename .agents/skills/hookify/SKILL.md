---
name: hookify
description: Easily create hooks to prevent unwanted behaviors by analyzing conversation patterns
---

# hookify

Easily create hooks to prevent unwanted behaviors by analyzing conversation patterns

Use this skill when the user asks for `hookify` functionality, or requests workflows covered by this plugin.

## Source
- Codex skill: `hookify@55b58ec6e564`
- Local cache path: `/root/.claude/plugins/cache/claude-plugins-official/hookify/55b58ec6e564`

## Available Components
- Top-level components: agents, commands, core, examples, hooks, matchers, skills, utils

## Execution Notes
- Prefer existing scripts/commands in this directory before re-implementing logic.
- If a behavior is not directly executable in Codex runtime, use the nearest equivalent toolchain and preserve intent.
- Source snapshots and manifests are stored under `references/claude-plugin-source/`.

## Codex Plugin Parity
- Port mode: functional parity adapted for Codex workflows.
- Merge mode: non-destructive; conflicting files are preserved under `claude_port/`.
