---
name: code-review:code-review
description: Automated code review for pull requests using multiple specialized agents with confidence-based scoring
---

# code-review

Automated code review for pull requests using multiple specialized agents with confidence-based scoring

Use this skill when the user asks for `code-review` functionality, or requests workflows covered by this plugin.

## Source
- Claude plugin: `code-review@55b58ec6e564`
- Local cache path: `/root/.claude/plugins/cache/claude-plugins-official/code-review/55b58ec6e564`

## Available Components
- Top-level components: commands

## Execution Notes
- Prefer existing scripts/commands in this directory before re-implementing logic.
- If a behavior is not directly executable in Codex runtime, use the nearest equivalent toolchain and preserve intent.
- Source snapshots and manifests are stored under `references/claude-plugin-source/`.

## Claude Plugin Parity
- Port mode: functional parity adapted for Codex workflows.
- Merge mode: non-destructive; conflicting files are preserved under `claude_port/`.
