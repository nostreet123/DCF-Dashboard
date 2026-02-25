---
name: stripe
description: Stripe development plugin for Claude
---

# stripe

Stripe development plugin for Claude

Use this skill when the user asks for `stripe` functionality, or requests workflows covered by this plugin.

## Source
- Claude plugin: `stripe@0.1.0`
- Local cache path: `/root/.claude/plugins/cache/claude-plugins-official/stripe/0.1.0`

## Available Components
- Top-level components: commands, skills

## Execution Notes
- Prefer existing scripts/commands in this directory before re-implementing logic.
- If a behavior is not directly executable in Codex runtime, use the nearest equivalent toolchain and preserve intent.
- Source snapshots and manifests are stored under `references/claude-plugin-source/`.

## Smoke Test
- Run: `bash .agents/skills/stripe/scripts/smoke_stripe.sh`
- Optional strict mode (fails if endpoint not reachable): `STRICT_MODE=1 bash .agents/skills/stripe/scripts/smoke_stripe.sh`

## Claude Plugin Parity
- Port mode: functional parity adapted for Codex workflows.
- Merge mode: non-destructive; conflicting files are preserved under `claude_port/`.
