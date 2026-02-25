---
name: typescript-lsp
description: Port of Claude plugin `typescript-lsp` to Codex skill format.
---

# typescript-lsp

Port of Claude plugin `typescript-lsp` to Codex skill format.

Use this skill when the user asks for `typescript-lsp` functionality, or requests workflows covered by this plugin.

## Source
- Claude plugin: `typescript-lsp@1.0.0`
- Local cache path: `/root/.claude/plugins/cache/claude-plugins-official/typescript-lsp/1.0.0`

## Available Components
- Top-level components: metadata-only plugin

## Execution Notes
- Prefer existing scripts/commands in this directory before re-implementing logic.
- If a behavior is not directly executable in Codex runtime, use the nearest equivalent toolchain and preserve intent.
- Source snapshots and manifests are stored under `references/claude-plugin-source/`.

## Smoke Test
- Run: `bash .agents/skills/typescript-lsp/scripts/smoke_typescript_lsp.sh`
- The script validates `typescript-language-server` availability and `tsc` diagnostics on a failing sample.

## Claude Plugin Parity
- Port mode: functional parity adapted for Codex workflows.
- Merge mode: non-destructive; conflicting files are preserved under `claude_port/`.
