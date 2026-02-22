# PR Timeline and Delivery Roadmap

This document clarifies what shipped to `main`, what was superseded, and where to look for the delivered behavior.

## Current Mainline Snapshot

- `main` HEAD: `97b2fab` (`revert: undo refactor PRs #14 #15 #16 (#17)`)
- PR #6 is **closed and unmerged**.
- The capabilities discussed in/around PR #6 were delivered via later merged PRs (primarily #7, plus #8 and #9).
- PRs #14, #15, and #16 were merged and then intentionally reverted by PR #17.

## PR Timeline

1. PR #1 (MERGED, 2026-01-09): `Codex variant`
   - Initial large foundation for sync/Convex workflow and CI setup.

2. PR #2 (MERGED, 2026-01-18): `Dcf engine implementation`
   - Major DCF engine and integration expansion.

3. PR #3 (CLOSED, unmerged, 2026-01-18): `Increase Damodaran sync insert batch size and fix test import`
   - Targeted `dcf-engine-implementation` branch; not merged to `main`.

4. PR #5 (MERGED, 2026-01-30): `feat(sync): avoid redundant downloads and duplicate logs`
   - Sync hardening and related updates.

5. PR #4 (MERGED, 2026-01-30): `feat(convex): harden sync safety and duplicate maintenance`
   - Convex maintenance/safety improvements.

6. PR #6 (CLOSED, unmerged, 2026-02-18): `fix: stabilize Monte Carlo seed inputs`
   - Large stale branch; not merged.

7. PR #7 (MERGED, 2026-02-17): `refactor: execute R-002..R-007 backlog + API resilience fixes`
   - Large integration/refactor PR that includes Monte Carlo seed-stability behavior and related tests.

8. PR #8 (MERGED, 2026-02-17): `fix: harden weekly sync and enforce additive-only scheduled sync`
   - Additive-only weekly sync behavior.

9. PR #9 (MERGED, 2026-02-18): `fix: harden company search and EDGAR facts errors`
   - Company/EDGAR API error mapping hardening.

10. PR #14 (MERGED, 2026-02-22): `refactor(convex): extract shared normalization and decompose handlers`
   - Convex refactor changes (later reverted).

11. PR #15 (MERGED, 2026-02-22): `refactor(python): decompose sync orchestration and centralize validation`
   - Python refactor changes (later reverted).

12. PR #16 (MERGED, 2026-02-22): `refactor(frontend): centralize workbench defaults and shared UI interactions`
   - Frontend refactor changes (later reverted).

13. PR #17 (MERGED, 2026-02-22): `revert: undo refactor PRs #14 #15 #16`
   - Restored `main` to the state before #14.

## Where Features Landed

### Monte Carlo Seed Stability

Delivered on `main` via PR #7:

- `app/api/_lib/monteCarloPreset.ts`
- `test/monteCarloPreset.test.ts`
- `app/api/dcf/preview/route.ts`
- `app/api/dcf/run/route.ts`
- `python/tests/test_workbench_monte_carlo.py`

### Weekly Sync Additive-Only Mode

Delivered via PR #8 in:

- `.github/workflows/damodaran-weekly-sync.yml`
- `python/damodaran_sync/cli.py`
- `python/damodaran_sync/sync.py`
- `python/tests/test_sync_process_page.py`

### Company Search + EDGAR Facts Error Hardening

Delivered via PR #9 in:

- `app/api/_lib/dcfEngine.ts`
- `app/api/company/facts/route.ts`
- `convex/companies.ts`
- `convex/schema.ts`
- `test/dcfEngine.test.ts`

## Operational Guidance

- Do not revive PR #6 as a merge target.
- For future fixes, branch from current `main` and submit focused PRs.
- Treat this file as the canonical handoff reference when questions arise about PR #6 vs #7/#8/#9.
