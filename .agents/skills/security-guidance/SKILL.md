---
name: security-guidance
description: Security reminder hook that warns about potential security issues when editing files, including command injection, XSS, and unsafe code patterns
---

# security-guidance

Security reminder hook that warns about potential security issues when editing files, including command injection, XSS, and unsafe code patterns

Use this skill when the user asks for `security-guidance` functionality, or requests workflows covered by this plugin.

## Source
- Claude plugin: `security-guidance@55b58ec6e564`
- Local cache path: `/root/.claude/plugins/cache/claude-plugins-official/security-guidance/55b58ec6e564`

## Available Components
- Top-level components: hooks

## Execution Notes
- Prefer existing scripts/commands in this directory before re-implementing logic.
- If a behavior is not directly executable in Codex runtime, use the nearest equivalent toolchain and preserve intent.
- Source snapshots and manifests are stored under `references/claude-plugin-source/`.

## Claude Plugin Parity
- Port mode: functional parity adapted for Codex workflows.
- Merge mode: non-destructive; conflicting files are preserved under `claude_port/`.
