---
name: qodo-skills
description: Shift-left code review skills that bring Qodo's quality standards and code review capabilities into your local development workflow. Catch issues before comm...
---

# qodo-skills

Shift-left code review skills that bring Qodo's quality standards and code review capabilities into your local development workflow. Catch issues before commit, enforce organizational standards, and resolve PR feedback directly in your agent.

Use this skill when the user asks for `qodo-skills` functionality, or requests workflows covered by this plugin.

## Source
- Claude plugin: `qodo-skills@0.3.0`
- Local cache path: `/root/.claude/plugins/cache/claude-plugins-official/qodo-skills/0.3.0`

## Available Components
- Top-level components: hooks, skills

## Execution Notes
- Prefer existing scripts/commands in this directory before re-implementing logic.
- If a behavior is not directly executable in Codex runtime, use the nearest equivalent toolchain and preserve intent.
- Source snapshots and manifests are stored under `references/claude-plugin-source/`.

## Claude Plugin Parity
- Port mode: functional parity adapted for Codex workflows.
- Merge mode: non-destructive; conflicting files are preserved under `claude_port/`.
