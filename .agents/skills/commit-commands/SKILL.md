---
name: commit-commands
description: Streamline your git workflow with simple commands for committing, pushing, and creating pull requests
---

# commit-commands

Streamline your git workflow with simple commands for committing, pushing, and creating pull requests

Use this skill when the user asks for `commit-commands` functionality, or requests workflows covered by this plugin.

## Source
- Claude plugin: `commit-commands@55b58ec6e564`
- Local cache path: `/root/.claude/plugins/cache/claude-plugins-official/commit-commands/55b58ec6e564`

## Available Components
- Top-level components: commands

## Execution Notes
- Prefer existing scripts/commands in this directory before re-implementing logic.
- If a behavior is not directly executable in Codex runtime, use the nearest equivalent toolchain and preserve intent.
- Source snapshots and manifests are stored under `references/claude-plugin-source/`.

## Claude Plugin Parity
- Port mode: functional parity adapted for Codex workflows.
- Merge mode: non-destructive; conflicting files are preserved under `claude_port/`.
