---
name: pyright-lsp
description: Port of Claude plugin `pyright-lsp` to Codex skill format.
---

# pyright-lsp

Port of Claude plugin `pyright-lsp` to Codex skill format.

Use this skill when the user asks for `pyright-lsp` functionality, or requests workflows covered by this plugin.

## Source
- Claude plugin: `pyright-lsp@1.0.0`
- Local cache path: `/root/.claude/plugins/cache/claude-plugins-official/pyright-lsp/1.0.0`

## Available Components
- Top-level components: metadata-only plugin

## Execution Notes
- Prefer existing scripts/commands in this directory before re-implementing logic.
- If a behavior is not directly executable in Codex runtime, use the nearest equivalent toolchain and preserve intent.
- Source snapshots and manifests are stored under `references/claude-plugin-source/`.

## Smoke Test
- Run: `bash .agents/skills/pyright-lsp/scripts/smoke_pyright_lsp.sh`
- The script validates that `pyright` (or `npx pyright`) produces expected type diagnostics.

## Claude Plugin Parity
- Port mode: functional parity adapted for Codex workflows.
- Merge mode: non-destructive; conflicting files are preserved under `claude_port/`.
