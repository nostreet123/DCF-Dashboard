---
name: skills-migrate-and-verify
description: This skill should be used when the user asks to "migrate skills", "unify skills across CLIs", "skills aren't showing in the TUI", "I only see apps when listing skills", or mentions `.agents/skills`, `.codex/skills`, `~/.codex/skills`, or OpenCode skills discovery.
version: 0.1.0
---

# Skills: Migrate And Verify

Inventory and unify skill directories across Codex/OpenCode/other CLIs, and diagnose why skills may not appear in a TUI.

## What This Skill Is For

Use this skill to:
- Detect which skill roots exist (`./.agents/skills`, `/root/.codex/skills`, `~/.agents/skills`, etc.).
- Detect symlink targets and mismatches.
- Identify duplicates (same skill name in multiple places).
- Propose a canonical layout: store skills in-repo under `./.agents/skills` and symlink other roots to it.

## Workflow

1. Run the inventory script to see the current state.
2. Choose a canonical skill root (default: `./.agents/skills` in the repo).
3. If needed, migrate and/or replace other roots with symlinks to the canonical root.
4. Re-run inventory and re-check the CLI/TUI skill listing.

## Commands

Run from this skill directory (`.agents/skills/skills-migrate-and-verify/`):

- Inventory skill roots and symlinks:
  - `python3 scripts/skills_inventory.py`

- Inventory with extra detail:
  - `python3 scripts/skills_inventory.py --list-skills --max-list 80`

## Notes

- Prefer to print suggested `ln -sfn ...` commands rather than executing changes automatically.
- Back up a non-symlink directory before replacing it with a symlink (especially if it contains custom skills).
