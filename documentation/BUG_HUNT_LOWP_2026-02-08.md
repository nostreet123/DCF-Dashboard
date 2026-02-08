# Lower-P Bug Hunt (P2/P3) - 2026-02-08

## Objective
Run a focused quality pass for non-blocking defects after P0/P1 closure, with emphasis on reliability edges, runtime scalability limits, and developer ergonomics.

## Scope
- Next API helpers and route-adjacent logic in `app/api/`
- Convex queries/mutations in `convex/`
- Python engine/sync non-critical behavior in `python/`
- Test and diagnostics quality in `test/`, `convex_tests/`, `python/tests/`

## Severity Definitions
- `P2`: user-visible bug or runtime failure with workaround; not release-blocking.
- `P3`: low-impact bug, warning, testability gap, or maintainability/diagnostic issue.

## Execution Cadence
1. Daily intake and triage (15 min)
2. Fix 1-2 P2 items or 2-4 P3 items
3. Add/extend regression coverage
4. Re-run targeted suites, then full sweep before merge

## Core Checks
```bash
npm test
bunx convex typecheck
bun run test:convex
.venv/bin/python -m pytest

# Convex runtime probe set
node run_debug_timeline.js --correlation-id=<id>
node run_debug_failures.js --limit=50
```

## Initial Findings Queue

| ID | Severity | Area | Evidence | Status | Next Action |
| --- | --- | --- | --- | --- | --- |
| LP-2026-02-08-01 | P2 | `convex/metrics.ts` | Live probe: `metrics:getCounts` fails with Convex error: "multiple paginated queries". | Fixed + verified | Replaced paginated counting with indexed `collect()` counts, added regression test, deployed dev/prod, re-probed successfully. |
| LP-2026-02-08-02 | P3 | Node test runner ergonomics | `npm test` emits `MODULE_TYPELESS_PACKAGE_JSON` warning for every test file. | Fixed + verified | Added targeted Node warning suppression in test script; warning no longer appears in test output. |
| LP-2026-02-08-03 | P3 | Route-level testability | Direct tests importing Next route modules remain constrained under `node --test`; helper-level coverage only. | Fixed + verified | Added dedicated Bun route import smoke test (`test:routes`) that imports real route modules and validates handler exports. |
| LP-2026-02-08-04 | P3 | Convex search scalability | `companies:search` now avoids runtime crash but scans up to 5000 records; potential latency growth at scale. | Fixed + verified | Reworked to staged, bounded strategy: symbol-prefix index query + capped fallback scan (`1000`); deployed and live-probed. |

## Exit Criteria for This Track
- Zero open P2 with known reproducible runtime failure.
- P3 items either fixed or documented with owner + date.
- Regression coverage added for each fixed P2/P3 bug.

## Reporting
Use `documentation/BUG_HUNT_LOWP_BOARD_2026-02-08.md` as the active board. Keep this plan file stable and append updates to the board.
