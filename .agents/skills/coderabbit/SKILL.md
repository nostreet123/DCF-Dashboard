---
name: coderabbit
description: AI-powered code review in Codex CLI, powered by CodeRabbit
---

# coderabbit

AI-powered code review in Codex CLI, powered by CodeRabbit

Use this skill when the user asks for `coderabbit` functionality, or requests workflows covered by this plugin.

## Source
- Codex skill: `coderabbit@1.0.0`
- Local cache path: `/root/.claude/plugins/cache/claude-plugins-official/coderabbit/1.0.0`

## Available Components
- Top-level components: agents, commands, skills

## Execution Notes
- Prefer existing scripts/commands in this directory before re-implementing logic.
- If a behavior is not directly executable in Codex runtime, use the nearest equivalent toolchain and preserve intent.
- Source snapshots and manifests are stored under `references/claude-plugin-source/`.

## Codex Plugin Parity
- Port mode: functional parity adapted for Codex workflows.
- Merge mode: non-destructive; conflicting files are preserved under `claude_port/`.
