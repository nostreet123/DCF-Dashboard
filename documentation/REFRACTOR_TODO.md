# Comprehensive TODO - Remaining Refactorings

## Final Status (2026-02-14)

- `R-002`: Done
- `R-003`: Done
- `R-004`: Done
- `R-005`: Done
- `R-006`: Done
- `R-007`: Done

## Global Gates

- [x] Keep Convex mutation auth invariant: all mutations call `requireSyncToken()`.
- [x] Keep Convex query/index invariant: list queries use `withIndex()`.
- [x] Keep Python library logging invariant: no bare `print()` in library code.
- [x] Keep backward compatibility for existing public function names and API routes.
- [x] Update `documentation/REFRACTOR_REPORT.md` status/checklists for each completed item.

## R-002 TODO - Duplicate Scan Decomposition

- [x] Add `convex/maintenance/duplicateScan.page.ts` with reusable carry/group pagination helpers.
- [x] Add `convex/maintenance/duplicateScan.logic.ts` with phase transition and patch construction helpers.
- [x] Replace duplicated logic in page finders with shared helper functions.
- [x] Replace duplicated scheduling logic between `runDuplicateScanOnce` and `runDuplicateScanTick` with one helper.
- [x] Replace `patch: v.any()` in `updateDuplicateScanStateInternal` with typed validator.
- [x] Keep all existing exported function names in `convex/maintenance.ts` unchanged.
- [x] Add tests for carry handoff, phase transition, completion state, and stale run state scheduling.
- [x] Verify lock semantics still hold in success/error paths.

Verification:

```bash
bun test convex_tests/maintenance_shared.test.ts convex_tests/maintenance_duplicate_scan_logic.test.ts
bunx convex typecheck
```

## R-003 TODO - Snapshot and Duplicate Cleanup Hardening

- [x] Split snapshot selection/normalization helpers from `convex/snapshots.ts`.
- [x] Extract cleanup phase patch logic from `convex/maintenance/duplicateCleanup.ts`.
- [x] Isolate deep-typing `any` bridge (`runDuplicateCleanupChunkAny`) behind typed wrappers.
- [x] Consolidate repeated cleanup patch updates with helper builders.
- [x] Preserve snapshot/tableData delete ordering and idempotent chunk behavior.
- [x] Add tests for dry-run patches, snapshot/asset phase progression, and lock timeout availability logic.
- [x] Keep compatibility with scan group contracts from `R-002`.

Verification:

```bash
bun test convex_tests/maintenance_shared.test.ts convex_tests/maintenance_duplicate_cleanup_logic.test.ts convex_tests/maintenance_snapshot_cleanup.test.ts convex_tests/snapshots_helpers.test.ts
bunx convex typecheck
```

## R-004 TODO - Convex Sync Client Surface Refactor

- [x] Add centralized response validation helpers for `dict`, `list`, and scalar responses.
- [x] Replace repeated inline type checks with shared validators.
- [x] Keep retry/backoff logic centralized in `_execute`.
- [x] Keep token sanitization in error logging paths.
- [x] Expand malformed-response tests and typed wrapper coverage.
- [x] Preserve existing `ConvexSyncClient` method names/signatures used by sync orchestration.

Verification:

```bash
cd python && ../.venv/bin/pytest tests/test_convex_client.py tests/test_sync_process_page.py -q
```

## R-005 TODO - Dataset Mappings Maintainability

- [x] Separate static seed payloads from mapping pattern helpers.
- [x] Add explicit uniqueness validation for keys/slugs/regions/sort orders.
- [x] Add conflict and ambiguity validation for mapping patterns.
- [x] Introduce deterministic integrity check command (`validate-mappings`).
- [x] Expand tests for collision/ambiguity and ordering guarantees.
- [x] Preserve resolver behavior for known filename and region token edges.

Verification:

```bash
cd python && ../.venv/bin/pytest tests/test_dataset_mappings.py tests/test_mapping_resolver.py -q
```

## R-006 TODO - SEC EDGAR Service Decomposition

- [x] Split transport/retry logic into `sec_edgar_http.py`.
- [x] Split cache read/write and TTL handling into `sec_edgar_cache.py`.
- [x] Split extraction/normalization into `sec_edgar_extract.py`.
- [x] Keep Pydantic return contracts stable via `sec_edgar_models.py` and `sec_edgar.py` exports.
- [x] Add tests for `_extract_annual_values`, debt combine logic, statement fallback behavior.
- [x] Add tests for cache hit/miss/stale/invalid payload handling.
- [x] Add tests for partial SEC payloads and unexpected units.
- [x] Preserve `search_companies(...)` and `fetch_company_facts(...)` signatures.

Verification:

```bash
cd python && ../.venv/bin/pytest tests/test_sec_edgar.py tests/test_engine_smoke.py -q
```

## R-007 TODO - Frontend State Decoupling

- [x] Remove duplicated local workbench state from `app/page.tsx`.
- [x] Move company/scenario/assumptions/compute state to context-backed actions/selectors.
- [x] Keep drawer-local UI state local via `useWorkbenchViewState`.
- [x] Replace mock-only callback logs with explicit handlers.
- [x] Add context reducer tests for scenario-specific assumption updates.
- [x] Add page-state tests for drawer interaction wiring (`docked` + `drawer`).

Verification:

```bash
bun test test/workbenchContext.test.ts test/dashboardPageState.test.ts test/dcfEngine.test.ts test/monteCarloPreset.test.ts
bun run build
```

## Final Stabilization

- [x] Full Python suite:

```bash
cd python && ../.venv/bin/pytest
```

- [x] Convex checks:

```bash
bunx convex typecheck
```

- [x] Frontend/node tests and build:

```bash
bun test
bun run build
```

## Change Log

| Date | Author | Items Updated | Summary |
|---|---|---|---|
| 2026-02-14 | codex | R-002..R-007 | Executed full refactor backlog, added helper modules/tests, and completed stabilization checks. |
