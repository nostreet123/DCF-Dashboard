---
name: code-simplifier
description: Agent that simplifies and refines code for clarity, consistency, and maintainability while preserving functionality
---

# code-simplifier

Agent that simplifies and refines code for clarity, consistency, and maintainability while preserving functionality

Use this skill when the user asks for `code-simplifier` functionality, or requests workflows covered by this plugin.

## Source
- Claude plugin: `code-simplifier@1.0.0`
- Local cache path: `/root/.claude/plugins/cache/claude-plugins-official/code-simplifier/1.0.0`

## Available Components
- Top-level components: agents

## Execution Notes
- Prefer existing scripts/commands in this directory before re-implementing logic.
- If a behavior is not directly executable in Codex runtime, use the nearest equivalent toolchain and preserve intent.
- Source snapshots and manifests are stored under `references/claude-plugin-source/`.

## Claude Plugin Parity
- Port mode: functional parity adapted for Codex workflows.
- Merge mode: non-destructive; conflicting files are preserved under `claude_port/`.
