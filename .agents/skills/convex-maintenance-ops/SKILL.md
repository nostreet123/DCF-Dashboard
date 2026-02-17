---
name: convex-maintenance-ops
description: This skill should be used when the user asks to "debug Convex maintenance", "duplicate scan already running", "UNAUTHORIZED", "prune retention", "stop duplicate scan", or mentions Convex maintenance functions under `convex/maintenance/`.
version: 0.1.0
---

# Convex Maintenance Ops

Troubleshoot and operate Convex maintenance functions in this repo (duplicate scan/cleanup, pruning, backfills) with a focus on auth, conflicts, and validator mismatches.

## What This Skill Is For

Use this skill to:
- Quickly find the relevant maintenance function and its validators.
- Diagnose common failure modes: `UNAUTHORIZED`, `CONFLICT` (locks), and argument/return validation errors.
- Decide whether the issue is auth/config, a stuck lock/state row, or a schema/code mismatch.

## Quick Orientation

- Maintenance entrypoints are exported via `convex/maintenance.ts` and implemented under `convex/maintenance/`.
- Most maintenance mutations/queries require `syncToken` enforced by `requireSyncToken()`.

## Workflow

1. Identify the failing function name and error class (`UNAUTHORIZED`, `CONFLICT`, `ArgumentValidationError`, `ReturnsValidationError`).
2. Verify auth (`DAMODARAN_SYNC_TOKEN`) is present and correct for the environment being called.
3. If a lock/conflict exists, inspect the state rows and decide whether to stop/reset.
4. If a validator mismatch exists, inspect the validator in the function definition and compare to the returned value.
5. Run `bunx convex typecheck` before deploying fixes.

## Commands

Run from repo root:

- Find maintenance exports and sync-token enforcement:
  - `bash .agents/skills/convex-maintenance-ops/scripts/maintenance_quickfind.sh`

- Typecheck Convex functions:
  - `bunx convex typecheck`

## Common Failure Modes

See `references/common_failures.md`.

## Notes

- Avoid pasting real tokens into chat; history may be logged locally.
- Prefer dry-run modes where available for destructive maintenance operations.
- `maintenance_quickfind.sh` requires `rg` (ripgrep) on PATH.
