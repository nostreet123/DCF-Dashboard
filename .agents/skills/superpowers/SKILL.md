---
name: superpowers
description: This skill should be used when the user asks to use "superpowers", asks for a "superpowers workflow", or references namespaced skills like "superpowers:writing-plans" or "superpowers:requesting-code-review".
---

# Superpowers Namespace

This is the namespaced in-repo port of Codex's `superpowers` plugin.

## Purpose

Use this namespace to route requests to the imported superpowers skills, commands, agents, and hooks under `.agents/skills/superpowers/`.

## Resolution Rules

1. For any request matching `superpowers:<skill-name>`, load:
   - `.agents/skills/superpowers/skills/<skill-name>/SKILL.md`
2. For command-style requests, inspect:
   - `.agents/skills/superpowers/commands/`
3. For agent-role review flows, inspect:
   - `.agents/skills/superpowers/agents/`
4. For startup/session behavior parity, inspect:
   - `.agents/skills/superpowers/hooks/`

## Versioning

Pinned upstream baseline and sync metadata are tracked in:
- `.agents/skills/superpowers/VERSION`
- `.agents/skills/superpowers/references/parity-matrix.md`
- `.agents/skills/superpowers/references/upstream-inventory-4.3.0.md`

## Maintenance

Run the sync utility to check or refresh parity from the local Codex cache:

```bash
python3 .agents/skills/superpowers/scripts/sync_superpowers.py --version 4.3.0 --check
python3 .agents/skills/superpowers/scripts/sync_superpowers.py --version 4.3.0 --apply
```


## Codex Plugin Parity
- Source plugin: `superpowers@4.3.1` from local Codex cache
- Merge mode: non-destructive (conflicts in `claude_port/`)
