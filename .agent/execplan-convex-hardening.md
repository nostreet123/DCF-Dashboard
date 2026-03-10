# Convex Database Layer Hardening

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This document must be maintained in accordance with `.agent/PLANS.md`.

## Purpose / Big Picture

The Convex database layer has strong fundamentals — 100% index-based queries, 100% mutation auth, a sound Build ID atomicity pattern — but it has operational safety gaps that increase risk as the system grows. After this work, a contributor will be able to:

1. Run integration tests that exercise the full Build ID lifecycle (upsert → insert rows → finalize → cleanup) against a local Convex test harness, catching regressions in the actual mutation/query handlers rather than just pure-logic helpers.
2. Trust that the snapshot-scoring logic cannot silently drift between the main code path and the maintenance code path, because it is consolidated into a single function.
3. See compile-time errors when index usage or query shapes are wrong in helper functions, because the `any`-typed Convex context parameters have been replaced with proper generic types.
4. Verify that seed data in TypeScript and Python stays in sync via an automated CI check.
5. See row counts served from a lightweight counter mechanism instead of full-table pagination scans.

The work is organized into two sprints of roughly equal effort. Sprint 1 addresses the highest-ROI items (integration tests, DRY consolidation, type safety). Sprint 2 addresses the remaining items (seed parity, metrics optimization).


## Progress

- [x] Sprint 1, Milestone 1: Consolidate duplicated snapshot-scoring logic
- [x] Sprint 1, Milestone 2: Replace `any`-typed Convex context in helpers
- [x] Sprint 1, Milestone 3: Add integration tests for Build ID lifecycle
- [x] Sprint 2, Milestone 4: Automated seed data parity check
- [x] Sprint 2, Milestone 5: Replace metrics full-scan counting with bounded counts


## Surprises & Discoveries

- `pickBestSnapshot` needed to be made generic (`<T extends SnapshotPick>(snapshots: T[]): T | null`) to preserve the full document type for callers in `snapshots.ts` that expected the complete snapshot document, not just `SnapshotPick`.

- `requestIdDedupe.ts` required `as unknown as T` casts because the `DatabaseReader` query on a union table (`"syncLogs" | "valuationRuns"`) returns a union of document types, and TypeScript cannot narrow a union directly to a generic `T`.

- Bun does not support `import.meta.glob`, which `convex-test` relies on for module discovery. Solved by manually building the modules map using `Bun.Glob` to scan the `convex/` directory and construct a `Record<string, () => Promise<any>>`.

- `normalizePrimaryKey` in `tableData.ts` replaces non-alphanumeric characters with spaces (not preserving hyphens). Test helper `makeRows` initially used `"row-a"` as `primaryKeyNorm` but the normalizer produces `"row a"`. Fixing the helper resolved the 2 failing integration tests.


## Decision Log

- Decision: Order sprint 1 as DRY → types → integration tests.
  Rationale: Consolidating the scoring function first means the integration tests will exercise the canonical version. Fixing types second means the integration tests will import properly typed helpers. This avoids writing tests against code that is about to change.
  Date/Author: 2026-03-04 / assistant

- Decision: Use `convex-test` for integration tests rather than a custom harness.
  Rationale: `convex-test` is the official Convex testing library that provides an in-memory Convex backend. The project already uses Bun as its test runner, which `convex-test` supports. This avoids building a bespoke test harness and ensures compatibility with future Convex versions.
  Date/Author: 2026-03-04 / assistant

- Decision: Keep `metrics.ts` optimization as bounded counts rather than a counter table.
  Rationale: A counter table requires incrementing/decrementing on every insert/delete across multiple mutation files, adding complexity and risk. The reference tables (categories, regions, datasets) are small (< 100 rows) and change only during seeding, so scanning them is cheap. The real problem is `snapshots` and `tableData` — for these, a bounded `.take(N+1)` approach (already used for `tableData`) is sufficient and requires no schema changes.
  Date/Author: 2026-03-04 / assistant

- Decision: Use `.collect()` for reference tables instead of pagination in `metrics.ts`.
  Rationale: Categories, regions, and datasets are each < 100 rows and change only during seeding. `.collect()` is simpler and cheaper than the pagination loop — one query call instead of potentially multiple pages. Only `snapshots` and `tableData` use the bounded `.take(LIMIT + 1)` pattern since they can grow large.
  Date/Author: 2026-03-05 / assistant

- Decision: Use a Node subprocess for TS seed extraction in the parity test.
  Rationale: Parsing TypeScript constant arrays with regex is fragile and error-prone. A Node one-liner that reads the source and uses `eval` on the extracted array literal is more reliable, since it handles nested structures, trailing commas, and template literals correctly. The subprocess adds ~0.1s to test runtime, which is negligible.
  Date/Author: 2026-03-05 / assistant


## Outcomes & Retrospective

All 5 milestones complete. Final validation results:

- `bun test convex_tests`: 42 tests pass (38 original + 4 new integration tests)
- `bunx convex typecheck`: passes with no errors
- `cd python && pytest`: 126 tests pass (117 original + 9 new seed parity tests)

**Milestone 1** — `pickSnapshotKeepId` in `convex/maintenance/shared.ts` now delegates to `pickBestSnapshot` from `convex/snapshots_helpers.ts`. The duplicated scoring loop is eliminated. All existing tests pass unchanged.

**Milestone 2** — `ctx: { db: any }` replaced with `ctx: { db: DatabaseReader }` in `snapshots_helpers.ts` and `requestIdDedupe.ts`. `(q: any)` casts removed. `pickBestSnapshot` made generic to preserve caller types.

**Milestone 3** — 4 integration tests in `convex_tests/buildIdLifecycle.test.ts` cover the full Build ID lifecycle: happy path, rebuild, unchanged, and auth enforcement. These are the first tests exercising actual Convex mutation/query handlers via `convex-test`.

**Milestone 4** — `python/tests/test_seed_parity.py` with 9 tests compares category slugs, region codes, dataset keys, region suffixes, regional base datasets, and dataset mapping patterns between `convex/seed.ts` and `python/damodaran_sync/dataset_mappings_seed.py`. Would fail immediately if a key is added to one side but not the other.

**Milestone 5** — `convex/metrics.ts` no longer paginates through any table. Reference tables use `.collect()` for exact counts. `snapshots` and `tableData` use bounded `.take(1001)` with `isSnapshotsCapped` and `isTableDataCapped` booleans. The `countQuery` pagination helper is removed entirely.


## Context and Orientation

The Convex database layer lives entirely in `/root/DCF-Dashboard/convex/`. The schema is defined in `convex/schema.ts` (20 tables, 38 indexes). Mutations and queries are in individual `.ts` files per domain (e.g., `snapshots.ts`, `tableData.ts`). Pure business logic is extracted into helper files (`snapshots_helpers.ts`, `maintenance/shared.ts`, etc.) and tested via Bun unit tests in `convex_tests/`.

Key files for this plan:

- `convex/snapshots_helpers.ts` — Contains `pickBestSnapshot()` (lines 47-75) and `findSnapshotByIdentity()` (lines 77-105). The latter uses `ctx: { db: any }` and `(q: any)` for Convex query builders.
- `convex/maintenance/shared.ts` — Contains `pickSnapshotKeepId()` (lines 100-137), a near-duplicate of `pickBestSnapshot()` that returns `._id` instead of the full object.
- `convex/requestIdDedupe.ts` — Uses `ctx: { db: any }` for the Convex context.
- `convex/metrics.ts` — `getCounts` query (lines 4-81) paginates through 4 tables on every call.
- `convex/seed.ts` — TypeScript seed data for categories, regions, datasets, dataset mappings.
- `python/damodaran_sync/dataset_mappings_seed.py` — Python mirror of the same seed data.
- `convex_tests/` — 9 Bun test files, all unit tests against pure functions.

The "Build ID pattern" is the core data-write workflow:
1. `snapshots:upsertByIdentity` creates/updates a snapshot with a `pendingBuildId` and status `"rebuilding"`.
2. `tableData:insertBatch` inserts data rows tagged with that `buildId`.
3. `snapshots:finalizeRebuild` promotes `pendingBuildId` to `activeBuildId` and sets status to `"ready"`.
4. `tableData:deleteBySnapshotBuild` cleans up rows from the old `buildId`.
Readers always filter `tableData` by `activeBuildId`, so they never see partial writes.

"Scoring logic" refers to the `pickBestSnapshot` / `pickSnapshotKeepId` functions. Both rank snapshots by the same lexicographic tuple `[hasActiveBuild, hasPendingBuild, downloadedAt, parsedAt, creationTime]` to deterministically choose the "best" among duplicates. They exist in two places with slightly different return types.


## Plan of Work

### Sprint 1 — High-ROI Hardening

#### Milestone 1: Consolidate duplicated snapshot-scoring logic

The functions `pickBestSnapshot` in `convex/snapshots_helpers.ts:47-75` and `pickSnapshotKeepId` in `convex/maintenance/shared.ts:100-137` implement identical scoring logic. `pickBestSnapshot` returns the full object (or `null`); `pickSnapshotKeepId` returns only `._id` (or `null`). The fix is to make `pickSnapshotKeepId` call `pickBestSnapshot` internally and extract `._id`, eliminating the duplicated scoring loop.

The type `SnapshotPick` (defined in `snapshots_helpers.ts:8-15`) will serve as the canonical input type for both. `pickSnapshotKeepId` currently defines an inline type that is structurally identical to `SnapshotPick`; it should import `SnapshotPick` instead.

Steps:
1. In `convex/maintenance/shared.ts`, import `pickBestSnapshot` and `SnapshotPick` from `../snapshots_helpers`.
2. Replace the body of `pickSnapshotKeepId` with a call to `pickBestSnapshot(snapshots)`, returning `result?._id ?? null`.
3. Update the parameter type of `pickSnapshotKeepId` to use `SnapshotPick[]`.
4. Run existing tests: `bun test convex_tests/maintenance_shared.test.ts` and `bun test convex_tests/snapshots_helpers.test.ts`. Both must pass unchanged, proving behavioral equivalence.

#### Milestone 2: Replace `any`-typed Convex context in helpers

Three helper functions use `ctx: { db: any }` and `(q: any)`:
- `findSnapshotByIdentity` in `convex/snapshots_helpers.ts:77-105`
- `findExistingByRequestId` in `convex/requestIdDedupe.ts`

Convex provides `GenericQueryCtx` and `GenericMutationCtx` from `convex/server` for typing contexts outside of direct query/mutation handlers. The fix is to import the project's generated `DataModel` type from `convex/_generated/dataModel` and use `GenericQueryCtx<DataModel>` (or `GenericMutationCtx<DataModel>`) as the context type. This gives full type safety on `.query("tableName")` and `.withIndex("indexName", ...)` calls.

Steps:
1. In `convex/snapshots_helpers.ts`, replace `ctx: { db: any }` with `ctx: { db: GenericDatabaseReader<DataModel> }` (imported from `convex/server` and `_generated/dataModel`). Remove the `(q: any)` casts on the query builder callbacks — the types will be inferred from the index definition.
2. In `convex/requestIdDedupe.ts`, apply the same pattern.
3. Run `bunx convex typecheck` to verify the types are correct.
4. Run `bun test convex_tests` to verify no regressions.

#### Milestone 3: Add integration tests for Build ID lifecycle

This milestone adds the first integration tests that exercise actual Convex mutation and query handlers against an in-memory Convex backend using `convex-test`.

The test file `convex_tests/buildIdLifecycle.test.ts` will cover:

1. **Happy path**: Call `snapshots:upsertByIdentity` (expect `action: "created"`), call `tableData:insertBatch` with rows, call `snapshots:finalizeRebuild`, then call `tableData:listBySnapshot` and verify the rows are returned.
2. **Rebuild path**: Call `upsertByIdentity` again on the same identity with a new `fileHash` (expect `action: "updated"`), insert new rows with the new `pendingBuildId`, finalize, then verify `listBySnapshot` returns only the new rows (old rows should be deletable via `deleteBySnapshotBuild`).
3. **Unchanged path**: Call `upsertByIdentity` with the same `fileHash` as the current snapshot (expect `action: "unchanged"`).
4. **Auth enforcement**: Call `insertBatch` without a `syncToken` and verify it throws `UNAUTHORIZED`.

Steps:
1. Install `convex-test` as a dev dependency: `npm install --save-dev convex-test`.
2. Create `convex_tests/buildIdLifecycle.test.ts` with the four test cases described above.
3. Run `bun test convex_tests/buildIdLifecycle.test.ts` and verify all tests pass.


### Sprint 2 — Operational Polish

#### Milestone 4: Automated seed data parity check

The seed data in `convex/seed.ts` and `python/damodaran_sync/dataset_mappings_seed.py` must stay in sync. This milestone adds a CI-runnable script that extracts the canonical keys from both files and compares them.

Steps:
1. Create `python/tests/test_seed_parity.py` — a pytest test that:
   a. Parses the Python seed data from `dataset_mappings_seed.py` (it's a Python module, so it can be imported directly).
   b. Parses the TypeScript seed data from `convex/seed.ts` by extracting JSON-like structures with a simple regex or by running a Node one-liner that imports and prints the data.
   c. Compares category slugs, region codes, dataset keys, and mapping patterns. Asserts they are identical sets.
2. Run `cd python && pytest tests/test_seed_parity.py` and verify it passes.

#### Milestone 5: Replace metrics full-scan counting with bounded counts

`convex/metrics.ts:getCounts` currently paginates through `categories`, `regions`, `datasets`, and `snapshots` to count all rows. The reference tables are small and stable (< 100 rows each), but `snapshots` can grow large. The fix is to use a bounded `.take(N+1)` pattern for `snapshots` (matching what is already done for `tableData`) and keep exact counts only for the small reference tables.

Steps:
1. In `convex/metrics.ts`, replace the `snapshots` counting branch with a bounded `.take(LIMIT + 1)` call, matching the `tableData` pattern. Add an `isSnapshotsCapped` boolean to the return type.
2. Update the return type validator to include `isSnapshotsCapped: v.boolean()`.
3. Check if any frontend code consumes `getCounts` and update it to handle the new `isSnapshotsCapped` field.
4. Run `bunx convex typecheck` to verify types.


## Concrete Steps

All commands are run from the repository root `/root/DCF-Dashboard` unless otherwise noted.

Sprint 1:

    # Milestone 1: After editing shared.ts
    bun test convex_tests/maintenance_shared.test.ts
    bun test convex_tests/snapshots_helpers.test.ts

    # Milestone 2: After fixing types
    bunx convex typecheck
    bun test convex_tests

    # Milestone 3: After writing integration tests
    npm install --save-dev convex-test
    bun test convex_tests/buildIdLifecycle.test.ts

Sprint 2:

    # Milestone 4: After writing parity test
    cd python && pytest tests/test_seed_parity.py

    # Milestone 5: After editing metrics.ts
    bunx convex typecheck


## Validation and Acceptance

After all milestones are complete:

    bun test convex_tests          # All tests pass, including new integration tests
    bunx convex typecheck          # No type errors
    cd python && pytest            # All Python tests pass, including seed parity

Specific acceptance criteria:

- Milestone 1: `pickSnapshotKeepId` no longer contains its own scoring loop. Existing tests pass unchanged.
- Milestone 2: No `any` types remain in `snapshots_helpers.ts` or `requestIdDedupe.ts`. `bunx convex typecheck` passes.
- Milestone 3: 4 new integration tests pass in `buildIdLifecycle.test.ts`.
- Milestone 4: `test_seed_parity.py` passes and would fail if a dataset key were added to one file but not the other.
- Milestone 5: `getCounts` no longer paginates through `snapshots`. TypeScript types pass.


## Idempotence and Recovery

All milestones are additive. No data migrations, schema changes, or destructive operations are involved. Each milestone can be re-run independently. If a milestone fails partway through, the contributor can restart from the beginning of that milestone with no cleanup needed.


## Artifacts and Notes

Duplicated scoring logic evidence — the two functions side by side:

    # convex/snapshots_helpers.ts:51-57
    const score = (snapshot: SnapshotPick) => [
      snapshot.activeBuildId ? 1 : 0,
      snapshot.pendingBuildId ? 1 : 0,
      snapshot.downloadedAt ?? 0,
      snapshot.parsedAt ?? 0,
      snapshot._creationTime,
    ];

    # convex/maintenance/shared.ts:113-119
    const score = (snapshot: typeof snapshots[number]) => [
      snapshot.activeBuildId ? 1 : 0,
      snapshot.pendingBuildId ? 1 : 0,
      snapshot.downloadedAt ?? 0,
      snapshot.parsedAt ?? 0,
      snapshot._creationTime,
    ];

These are character-for-character identical scoring functions in two separate files.


## Interfaces and Dependencies

No new external dependencies except `convex-test` (Milestone 3). All other changes are internal refactors.

Key types after Milestone 2:

    // convex/snapshots_helpers.ts
    import type { GenericDatabaseReader } from "convex/server";
    import type { DataModel } from "./_generated/dataModel";

    export const findSnapshotByIdentity = async (
      ctx: { db: GenericDatabaseReader<DataModel> },
      datasetKey: string,
      regionCode: string,
      asOfDate: string,
    ) => { ... };

    // convex/requestIdDedupe.ts
    export const findExistingByRequestId = async <T extends string>(
      ctx: { db: GenericDatabaseReader<DataModel> },
      table: T,
      requestId: string | undefined,
    ) => { ... };
