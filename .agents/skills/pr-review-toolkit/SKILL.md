---
name: pr-review-toolkit
description: Comprehensive PR review agents specializing in comments, tests, error handling, type design, code quality, and code simplification
---

# pr-review-toolkit

Comprehensive PR review agents specializing in comments, tests, error handling, type design, code quality, and code simplification

Use this skill when the user asks for `pr-review-toolkit` functionality, or requests workflows covered by this plugin.

## Source
- Claude plugin: `pr-review-toolkit@55b58ec6e564`
- Local cache path: `/root/.claude/plugins/cache/claude-plugins-official/pr-review-toolkit/55b58ec6e564`

## Available Components
- Top-level components: agents, commands

## Execution Notes
- Prefer existing scripts/commands in this directory before re-implementing logic.
- If a behavior is not directly executable in Codex runtime, use the nearest equivalent toolchain and preserve intent.
- Source snapshots and manifests are stored under `references/claude-plugin-source/`.

## Claude Plugin Parity
- Port mode: functional parity adapted for Codex workflows.
- Merge mode: non-destructive; conflicting files are preserved under `claude_port/`.
