---
name: github
description: Official GitHub MCP server for repository management. Create issues, manage pull requests, review code, search repositories, and interact with GitHub's full ...
---

# github

Official GitHub MCP server for repository management. Create issues, manage pull requests, review code, search repositories, and interact with GitHub's full API directly from Codex CLI.

Use this skill when the user asks for `github` functionality, or requests workflows covered by this plugin.

## Source
- Codex skill: `github@55b58ec6e564`
- Local cache path: `/root/.claude/plugins/cache/claude-plugins-official/github/55b58ec6e564`

## Available Components
- Top-level components: metadata-only plugin

## Execution Notes
- Prefer existing scripts/commands in this directory before re-implementing logic.
- If a behavior is not directly executable in Codex runtime, use the nearest equivalent toolchain and preserve intent.
- Source snapshots and manifests are stored under `references/claude-plugin-source/`.

## Smoke Test
- Run: `bash .agents/skills/github/scripts/smoke_github.sh`
- Optional strict mode (requires authenticated `gh`): `STRICT_MODE=1 bash .agents/skills/github/scripts/smoke_github.sh`

## Codex Plugin Parity
- Port mode: functional parity adapted for Codex workflows.
- Merge mode: non-destructive; conflicting files are preserved under `claude_port/`.
