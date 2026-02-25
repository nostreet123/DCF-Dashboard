---
name: circleback
description: Circleback conversational context integration. Search and access meetings, emails, calendar events, and more.
---

# circleback

Circleback conversational context integration. Search and access meetings, emails, calendar events, and more.

Use this skill when the user asks for `circleback` functionality, or requests workflows covered by this plugin.

## Source
- Claude plugin: `circleback@1.0.0`
- Local cache path: `/root/.claude/plugins/cache/claude-plugins-official/circleback/1.0.0`

## Available Components
- Top-level components: metadata-only plugin

## Execution Notes
- Prefer existing scripts/commands in this directory before re-implementing logic.
- If a behavior is not directly executable in Codex runtime, use the nearest equivalent toolchain and preserve intent.
- Source snapshots and manifests are stored under `references/claude-plugin-source/`.

## Claude Plugin Parity
- Port mode: functional parity adapted for Codex workflows.
- Merge mode: non-destructive; conflicting files are preserved under `claude_port/`.
