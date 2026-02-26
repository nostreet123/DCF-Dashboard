# Codex-Only Skills Language Migration Plan

## Summary
Perform a full audit of `.agents/skills` and rewrite `Claude/CLAUDE/claude` mentions to Codex-oriented wording wherever safely possible, while preserving required runtime compatibility identifiers.

Scope decisions:
- Rewrite scope: Everything possible
- Intentional mentions: Codex-only wording
- Structural renames: Selected directories only
- Rename set: Top-level skill names only
- Behavior policy: Keep Claude behavior paths where required; remove Claude wording in user-facing copy

Top-level structural rename in scope:
- `.agents/skills/claude-md-management` -> `.agents/skills/codex-md-management`

## Phase 0: Baseline Inventory
### Task 0.1
Snapshot current mentions to `.agent/tmp/claude_mentions.before.txt`.

### Task 0.2
Classify mentions into CSV buckets:
- rewrite_safe
- rewrite_with_manual_review
- protected_runtime_identifier
- protected_legacy_source

Output: `.agent/tmp/claude_mentions.classified.csv`

## Phase 1: Automated Content Rewrite
### Task 1.1
Create deterministic rewrite script `.agent/scripts/rewrite_claude_mentions.py`.

### Task 1.2
Run dry-run and apply rewrite.

### Task 1.3
Add regression guard script `.agent/scripts/check_no_unapproved_claude_mentions.sh`.

## Phase 2: Selected Structural Rename
### Task 2.1
Rename `.agents/skills/claude-md-management` to `.agents/skills/codex-md-management`.

### Task 2.2
Update internal identity metadata in renamed skill.

### Task 2.3
Update repository references to renamed path/name.

## Phase 3: Manual Review for High-risk Files
### Task 3.1
Multi-CLI script prompts: keep behavior; rewrite wording.

### Task 3.2
Plugin-port/parity docs cleanup.

### Task 3.3
Keep legacy source snapshots untouched.

## Phase 4: Validation and Merge Readiness
### Task 4.1
Audit mentions after rewrite.

### Task 4.2
Run skills inventory sanity checks.

### Task 4.3
Run verification commands:
- `bun test convex_tests`
- `cd python && pytest -q`
- `bunx convex typecheck`

### Task 4.4
Append `ASSISTANT_LOG.md`.

## Commit Plan
1. chore(skills): add claude-mention inventory and rewrite tooling
2. chore(skills): apply codex wording migration across skills docs
3. refactor(skills): rename claude-md-management to codex-md-management
4. chore(skills): add guard check for unapproved claude mentions
