# CLAUDE.md Management Plugin

Tools to maintain and improve CLAUDE.md files - audit quality, capture session learnings, and keep project memory current.

## What It Does

Two complementary tools for different purposes:

| | codex-md-improver (skill) | /revise-codex-md (command) |
|---|---|---|
| **Purpose** | Keep CLAUDE.md aligned with codebase | Capture session learnings |
| **Triggered by** | Codebase changes | End of session |
| **Use when** | Periodic maintenance | Session revealed missing context |

## Usage

### Skill: codex-md-improver

Audits CLAUDE.md files against current codebase state:

```
"audit my CLAUDE.md files"
"check if my CLAUDE.md is up to date"
```

<img src="claude-md-improver-example.png" alt="CLAUDE.md improver showing quality scores and recommended updates" width="600">

### Command: /revise-codex-md

Captures learnings from the current session:

```
/revise-codex-md
```

<img src="revise-claude-md-example.png" alt="Revise command capturing session learnings into CLAUDE.md" width="600">

## Author

Isabella He (isabella@anthropic.com)
