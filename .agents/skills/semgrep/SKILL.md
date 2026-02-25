---
name: semgrep
description: Plugin by Semgrep. Allows Claude to use Semgrep via the MCP, hooks, and commands.
---

# semgrep

Plugin by Semgrep. Allows Claude to use Semgrep via the MCP, hooks, and commands.

Use this skill when the user asks for `semgrep` functionality, or requests workflows covered by this plugin.

## Source
- Claude plugin: `semgrep@15596f4def42`
- Local cache path: `/root/.claude/plugins/cache/claude-plugins-official/semgrep/15596f4def42/plugin`

## Available Components
- Top-level components: commands, hooks, scripts

## Execution Notes
- Prefer existing scripts/commands in this directory before re-implementing logic.
- If a behavior is not directly executable in Codex runtime, use the nearest equivalent toolchain and preserve intent.
- Source snapshots and manifests are stored under `references/claude-plugin-source/`.

## Smoke Test
- Run compatibility check only: `bash .agents/skills/semgrep/scripts/check_version.sh`
- Run full smoke (version + real finding): `bash .agents/skills/semgrep/scripts/smoke_semgrep.sh`

## Claude Plugin Parity
- Port mode: functional parity adapted for Codex workflows.
- Merge mode: non-destructive; conflicting files are preserved under `claude_port/`.
