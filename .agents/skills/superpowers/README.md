# Superpowers In-Repo Port

This directory contains a pinned, namespaced port of Codex's `superpowers` plugin.

## Scope

- All upstream superpowers skills (v4.3.0)
- Upstream superpowers commands
- Upstream superpowers agent prompts
- Upstream superpowers hooks

## Structure

- `skills/` - namespaced skills (`name: superpowers:<skill-name>`)
- `commands/` - upstream command markdown files
- `agents/` - upstream agent role prompts
- `hooks/` - upstream hook scripts and manifest
- `scripts/sync_superpowers.py` - parity check/import tool
- `scripts/validate_superpowers_port.py` - structural + parity + metadata validation
- `references/` - parity matrix, alias map, and inventory

## Sync

Check parity without writing files:

```bash
python3 .agents/skills/superpowers/scripts/sync_superpowers.py --version 4.3.0 --check
```

Apply import/sync from local Codex cache:

```bash
python3 .agents/skills/superpowers/scripts/sync_superpowers.py --version 4.3.0 --apply
```

Validate the imported port end-to-end:

```bash
python3 .agents/skills/superpowers/scripts/validate_superpowers_port.py
```
