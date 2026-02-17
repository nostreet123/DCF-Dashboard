# Refactoring Report Template

## 1. Header

- `Report Date`: YYYY-MM-DD
- `Prepared By`: Name or agent ID
- `Codebase Commit SHA`: `<git sha>`
- `Scope`: Full repo baseline (`app/`, `components/`, `lib/`, `convex/`, `python/`)
- `Execution Horizon`: 2-4 week tranche
- `Audience`: Software engineer AI agent

## 2. Purpose

Use this report to define, prioritize, and execute refactors with decision-complete tasks.  
This document is implementation-facing, not roadmap prose.

## 3. Method

### 3.1 Evidence Commands

Run these before scoring:

```bash
# Large-file hotspots
find app components lib convex python/dcf_engine python/damodaran_sync python/tests \
  -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.py' \) -print0 \
  | xargs -0 wc -l | sort -nr | head -n 40

# Debt markers
rg -n "TODO|FIXME|HACK|XXX|tech debt|technical debt" -S \
  app components lib convex python/dcf_engine python/damodaran_sync python/tests

# Convention drift (library code print usage)
rg -n "print\(" -S python/dcf_engine python/damodaran_sync

# Mutation/auth checks (Convex)
rg -n "export const.*= mutation|requireSyncToken" -S convex

# Query/index checks (Convex)
rg -n "export const.*= query|withIndex\(" -S convex
```

### 3.2 Scoring Model

Use 1-5 scales:

- `Risk`: production correctness/security/availability risk if unchanged
- `Impact`: delivery speed, maintainability, and defect reduction after refactor
- `Effort`: implementation and validation complexity

Formula:

`Priority Score = (Risk * 0.4) + (Impact * 0.4) + ((6 - Effort) * 0.2)`

Also assign:

- `Confidence`: `High | Medium | Low`

## 4. Inventory Table (All Candidates)

Add one row per candidate.

| ID | Area | Files | Symptom | Evidence | Risk (1-5) | Impact (1-5) | Effort (1-5) | Priority Score | Confidence | Tranche |
|---|---|---|---|---|---:|---:|---:|---:|---|---|
| R-001 | python-sync | `python/damodaran_sync/sync.py` | Large orchestration concentration | 1052 LOC hotspot | 4 | 5 | 3 | 4.2 | Medium | Now |
| R-002 | convex | `convex/maintenance/duplicateScan.ts` | Large maintenance logic surface | 1154 LOC hotspot | 4 | 4 | 3 | 3.8 | Medium | Now |
| R-003 | convex | `convex/snapshots.ts`, `convex/maintenance/duplicateCleanup.ts` | Complex rebuild/cleanup paths | 694 + 679 LOC hotspots | 4 | 4 | 4 | 3.6 | Medium | Later |
| R-004 | python-sync | `python/damodaran_sync/convex_client.py` | Broad client surface area | 591 LOC hotspot | 3 | 4 | 3 | 3.4 | Medium | Later |
| R-005 | python-sync | `python/damodaran_sync/dataset_mappings.py` | Mapping logic growth risk | 500 LOC hotspot | 3 | 3 | 2 | 3.4 | Medium | Later |
| R-006 | python-engine | `python/dcf_engine/service/sec_edgar.py` | Service contract complexity | 370 LOC hotspot | 3 | 4 | 3 | 3.4 | Medium | Later |
| R-007 | frontend | `app/page.tsx`, `lib/contexts/WorkbenchContext.tsx` | UI state coupling | 210 + 198 LOC hotspots | 3 | 3 | 3 | 3.0 | Low | Later |

Notes:

- `Area` values: `frontend`, `convex`, `python-sync`, `python-engine`, `cross-cutting`.
- `Tranche` values: `Now`, `Later`.
- Any item in `Now` must have a full task card in Section 5.

## 5. Decision-Complete Task Cards (Required for `Now`)

Copy this card once per `Now` item.

### [ID] Title

- `Objective`:
- `Owner Role`: (for example `python-engineer`, `convex-engineer`, `fullstack-engineer`)
- `Status`: `Not started | In progress | Done | Deferred`

#### Current Behavior

- Describe current behavior and constraints.
- Include concrete evidence links:
  - `<path>:<line>`
  - command output snippets

#### Target Behavior

- Define expected post-refactor behavior.
- Include explicit invariants and non-goals.

#### Implementation Steps

1. Step 1 with exact file targets.
2. Step 2 with exact interface/type changes.
3. Step 3 with migration and cleanup actions.
4. Step 4 with validation actions.

#### Public Interfaces / Types / Contracts

- API routes:
- Convex function signatures:
- Python model/type changes:
- Backward compatibility expectations:

#### Failure Modes and Mitigations

- Failure mode:
  - Mitigation:
- Failure mode:
  - Mitigation:

#### Test Plan

- Unit tests:
- Integration tests:
- Regression tests:
- Manual checks:

#### Acceptance Criteria

- [ ] Behavior verified against target invariants.
- [ ] Required tests added/updated and passing.
- [ ] No new convention violations (`print()` in library code, missing `requireSyncToken`, full scans without `withIndex`).
- [ ] Documentation updates included where contracts changed.

#### Rollback Strategy

- Revert scope and order:
- Data safety considerations:
- Feature-flag or fallback behavior (if applicable):

### R-001 Split Sync Orchestration and Remove Mixed Legacy Concerns

- `Objective`: Reduce `python/damodaran_sync/sync.py` orchestration complexity while preserving existing sync behavior.
- `Owner Role`: `python-engineer`
- `Status`: `Done`

#### Current Behavior

- `python/damodaran_sync/sync.py:263` combines download, parse, transform, upsert, finalize, and cleanup in `_process_asset`.
- `python/damodaran_sync/sync.py:557` combines discovery, manifest fast-exit, identity resolution, snapshot prefetch, threading, counters, and finalization in `process_page`.
- `python/damodaran_sync/sync.py:902` uses bare `print()` in library code for profiling output.
- `python/damodaran_sync/sync.py:956` keeps deprecated `sync_dataset_at_url` in the same module as the active orchestration path.
- Existing tests primarily target the legacy path (`python/tests/test_sync_performance.py:11`) and do not directly cover `process_page`.

#### Target Behavior

- `sync.py` remains the stable entrypoint for `process_page(...)` and `sync_dataset_at_url(...)`.
- Active path (`process_page`) is decomposed into small internal functions with clear boundaries:
  - discovery/manifest
  - asset identity resolution
  - snapshot prefetch
  - per-asset pipeline
  - completion/logging
- Profiling output uses `logger.info(...)`, not bare `print()`, in library code.
- Legacy single-asset sync remains backward compatible but isolated from active pipeline code paths.

#### Implementation Steps

1. Add test coverage for current `process_page` behavior in `python/tests/test_sync_process_page.py` using mocks for `discover`, `download`, `excel_parse`, `transform`, and `ConvexSyncClient`.
2. Extract batching helpers from `python/damodaran_sync/sync.py` into `python/damodaran_sync/sync_batching.py`:
   - `_estimate_payload_bytes`
   - `_iter_tabledata_batches`
   - `_is_batch_too_large_error`
   - `_insert_rows_resilient`
3. Extract asset resolution and record construction helpers into `python/damodaran_sync/sync_resolution.py`:
   - `_ResolvedAsset` (or `ResolvedAsset`)
   - `_build_asset_record`
   - pre-pass dataset/region resolution helper.
4. Refactor `process_page` in `python/damodaran_sync/sync.py` into phase helpers:
   - `_discover_assets_for_page(...)`
   - `_resolve_assets_for_page(...)`
   - `_prefetch_snapshots(...)`
   - `_process_assets_serial_or_parallel(...)`
   - `_finalize_sync_log(...)`
5. Replace `print(timing.report())` at `python/damodaran_sync/sync.py:902` with structured logging (`logger.info("%s", timing.report())`).
6. Move legacy helpers `_resolve_dataset_key`, `_resolve_region_code`, `sync_dataset_at_url` to `python/damodaran_sync/sync_legacy.py`, and re-export in `python/damodaran_sync/sync.py` for compatibility.
7. Keep CLI behavior unchanged in `python/damodaran_sync/cli.py:93` and `python/damodaran_sync/cli.py:105`.

#### Public Interfaces / Types / Contracts

- API routes: no change.
- Convex function signatures: no change.
- Python function contracts:
  - Preserve `process_page(page_url, page_type, client, force_rebuild=False, *, head_precheck=None) -> None`.
  - Preserve import compatibility for `sync_dataset_at_url` from `damodaran_sync.sync`.
- Backward compatibility expectations:
  - Existing CLI commands (`sync-current`, `sync-all`) keep behavior and flags unchanged.
  - Existing tests importing legacy helpers from `damodaran_sync.sync` continue to pass.

#### Failure Modes and Mitigations

- Failure mode: refactor changes Build ID ordering (upsert -> insert -> finalize -> cleanup).
  - Mitigation: retain call order exactly as currently implemented in `python/damodaran_sync/sync.py:448`, `python/damodaran_sync/sync.py:467`, `python/damodaran_sync/sync.py:485`, `python/damodaran_sync/sync.py:490`.
- Failure mode: parallel mode counters diverge from serial mode.
  - Mitigation: centralize aggregation helper and add parity tests for `DAMODARAN_SYNC_WORKERS=1` and `>1`.
- Failure mode: legacy import break for test/tooling callers.
  - Mitigation: keep compatibility re-export from `damodaran_sync.sync`.

#### Test Plan

- Unit tests:
  - `python/tests/test_sync_performance.py` existing `_is_batch_too_large_error` test remains green.
  - Add targeted tests for `sync_batching.py` batch sizing and resilient split behavior.
- Integration tests:
  - New `python/tests/test_sync_process_page.py` cases:
    - manifest fast-exit when unchanged
    - conditional skip path for not-modified download
    - finalize + cleanup invocation order
    - serial vs parallel worker execution parity.
- Regression tests:
  - Run `cd python && pytest tests/test_download_conditional.py tests/test_transform.py tests/test_convex_client.py tests/test_sync_performance.py tests/test_sync_process_page.py -v`.
- Manual checks:
  - Run `cd python && python -m damodaran_sync.cli sync-current --head-precheck` in a dev environment and verify log output (no bare print from library path).

#### Acceptance Criteria

- [x] `python/damodaran_sync/sync.py` no longer contains bare `print(...)` in library code.
- [x] `process_page` orchestration is phase-split and readable without altering external behavior.
- [x] Legacy entrypoint remains import-compatible from `damodaran_sync.sync`.
- [x] New and existing sync tests pass.

#### Verification (2026-02-14)

- Added helper modules: `python/damodaran_sync/sync_batching.py`, `python/damodaran_sync/sync_resolution.py`, `python/damodaran_sync/sync_legacy.py`.
- Refactored orchestration into phase helpers in `python/damodaran_sync/sync.py` and replaced timing `print()` with logger output.
- Added tests: `python/tests/test_sync_process_page.py`, `python/tests/test_sync_batching.py`.
- Ran:
  - `cd python && ../.venv/bin/pytest tests/test_sync_performance.py tests/test_sync_process_page.py tests/test_sync_batching.py -q`
  - `cd python && ../.venv/bin/pytest tests/test_sync_manifest_hash.py tests/test_download_conditional.py tests/test_convex_client.py tests/test_transform.py -q`

#### Rollback Strategy

- Revert refactor modules and restore prior monolithic implementation in `python/damodaran_sync/sync.py`.
- Keep data safety by preserving Build ID semantics (no schema changes).
- If needed, temporarily disable parallel workers by setting `DAMODARAN_SYNC_WORKERS=1`.

### R-002 Decompose Duplicate Scan State Machine and Remove Duplication

- `Objective`: Reduce complexity in `convex/maintenance/duplicateScan.ts` while preserving API and scheduling behavior.
- `Owner Role`: `convex-engineer`
- `Status`: `Not started`

#### Current Behavior

- `convex/maintenance/duplicateScan.ts:19` through `convex/maintenance/duplicateScan.ts:1153` combines public queries/mutations, internal queries/mutations, lock management, paging logic, and scheduler loop in one file.
- Snapshot and asset duplicate-page logic are duplicated (`convex/maintenance/duplicateScan.ts:69` and `convex/maintenance/duplicateScan.ts:159`).
- Chunk runner contains two near-parallel phase branches (`convex/maintenance/duplicateScan.ts:924` and `convex/maintenance/duplicateScan.ts:972`) with similar patch/update patterns.
- `runDuplicateScanOnce` and `runDuplicateScanTick` are effectively duplicated (`convex/maintenance/duplicateScan.ts:1055` and `convex/maintenance/duplicateScan.ts:1105`).
- There is no dedicated duplicate-scan test file in `convex_tests/`.

#### Target Behavior

- `duplicateScan.ts` remains the API surface for exported Convex functions.
- Stateful orchestration logic is extracted into pure helper modules to make behavior testable.
- Scan tick scheduling is implemented once and reused by both public “once/tick” entry points.
- Internal state patching is constrained to typed fields instead of unconstrained `v.any()`.

#### Implementation Steps

1. Add helper modules:
   - `convex/maintenance/duplicateScan.logic.ts` for phase transitions and patch builders.
   - `convex/maintenance/duplicateScan.page.ts` for shared carry/group pagination logic.
2. Move duplicated scan-page grouping logic from:
   - `findDuplicateSnapshotsPageInternalImpl`
   - `findDuplicateAssetsPageInternalImpl`
   into generic functions in `duplicateScan.page.ts` with table-specific adapters.
3. Move `runDuplicateScanChunk` phase-specific patch construction into `duplicateScan.logic.ts`:
   - `buildSnapshotPhasePatch(...)`
   - `buildAssetPhasePatch(...)`
   - `shouldScheduleNextChunk(...)`.
4. Deduplicate `runDuplicateScanOnce` and `runDuplicateScanTick` into one shared scheduler helper in `duplicateScan.ts`.
5. Replace `patch: v.any()` in `updateDuplicateScanStateInternal` (`convex/maintenance/duplicateScan.ts:677`) with a typed validator that allows only known mutable state fields.
6. Keep exports unchanged in `convex/maintenance.ts:4` and maintain existing names/signatures.
7. Add tests in `convex_tests/maintenance_duplicate_scan_logic.test.ts` for:
   - carry behavior across pages
   - phase transition from snapshots -> assets
   - completion transition (`status=complete`, `finishedAt`)
   - stale `runId` rejection behavior.

#### Public Interfaces / Types / Contracts

- API routes: no change.
- Convex exported function signatures: no change for:
  - `startDuplicateScan`
  - `stopDuplicateScan`
  - `runDuplicateScanChunk`
  - `runDuplicateScanOnce`
  - `runDuplicateScanTick`
  - list/query helpers.
- Schema changes: none in `convex/schema.ts`.
- Backward compatibility expectations:
  - Existing callers continue using `maintenance:*` exports without migration.
  - Internal mutation patch payload becomes stricter but remains compatible with in-repo callsites.

#### Failure Modes and Mitigations

- Failure mode: stale scheduled jobs from older runs overwrite newer state.
  - Mitigation: retain and test `runId` gating across all internal mutations/actions.
- Failure mode: lock not released on runner error.
  - Mitigation: preserve `finally` lock release path in chunk runner.
- Failure mode: duplicate group insertion repeats after retries.
  - Mitigation: preserve reset-on-restart behavior and runId-guarded inserts.

#### Test Plan

- Unit tests:
  - `convex_tests/maintenance_duplicate_scan_logic.test.ts` for pure logic helpers.
- Integration tests:
  - Extend/author a Convex maintenance test to validate state transitions through scheduler-triggered chunk calls (mocked runner context).
- Regression tests:
  - Run `bun test convex_tests/maintenance_shared.test.ts convex_tests/maintenance_duplicate_scan_logic.test.ts`.
  - Run `bunx convex typecheck`.
- Manual checks:
  - `bunx convex run maintenance:startDuplicateScan '{"syncToken":"..."}'`
  - Poll `maintenance:getDuplicateScanState` until complete and verify counters/samples.

#### Acceptance Criteria

- [ ] `convex/maintenance/duplicateScan.ts` is reduced to API wiring and thin handlers.
- [ ] Duplicate paging and tick scheduling logic is consolidated.
- [ ] `updateDuplicateScanStateInternal` patch shape is explicitly typed.
- [ ] New duplicate-scan tests pass and Convex typecheck passes.

#### Rollback Strategy

- Revert new helper modules and restore prior single-file implementation.
- Preserve runtime safety by keeping schema unchanged and retaining runId/lock guards.
- If issues occur in production, stop scan with `maintenance:stopDuplicateScan` and redeploy previous version.

## 6. 2-4 Week Execution Plan

Use this template to sequence `Now` items with dependencies.

### Week 1

- Focus: establish test baselines and extraction scaffolding.
- Items:
  - R-001: add `test_sync_process_page.py` and batching helper tests.
  - R-002: add duplicate-scan logic test harness and first pure helper extraction.
- Dependencies:
  - none; both can start in parallel.
- Exit criteria:
  - new baseline tests are green and enforce current behavior before deeper refactors.

### Week 2

- Focus: complete R-001 module decomposition.
- Items:
  - extract batching/resolution helpers from `sync.py`.
  - phase-split `process_page`.
  - replace library `print()` with logger output.
- Dependencies:
  - Week 1 baseline tests for R-001.
- Exit criteria:
  - R-001 acceptance criteria satisfied.

### Week 3

- Focus: complete R-002 state-machine decomposition and typed patching.
- Items:
  - dedupe paging logic.
  - dedupe scan tick scheduling.
  - type-constrain internal patch mutation.
- Dependencies:
  - Week 1 R-002 test harness.
- Exit criteria:
  - R-002 acceptance criteria satisfied and `bunx convex typecheck` green.

### Week 4 (Buffer / Stabilization)

- Focus: stabilization, regressions, and follow-up capture.
- Items:
  - address fallout defects.
  - document follow-on items for R-003 and R-004.
- Exit criteria:
  - no open critical regressions from R-001/R-002 and report statuses updated.

## 7. Dependency Map

List explicit ordering constraints:

- `R-002` should complete before `R-003` because duplicate cleanup logic depends on duplicate scan state/group contracts.
- `R-001` can run in parallel with `R-002` because they touch separate runtime stacks (Python vs Convex).
- `R-001` should complete before deep `R-004` client-surface refactors to avoid reworking extraction boundaries.

## 8. Verification Checklist

- [ ] Inventory includes all major code areas (`frontend`, `convex`, `python-sync`, `python-engine`).
- [ ] Every `Now` item has a complete task card.
- [ ] Each scored item has reproducible evidence.
- [ ] Priorities follow the fixed formula.
- [ ] Sequence is executable without additional design decisions.

## 9. PR Update Protocol (Required Maintenance)

Any PR that touches files in this report must update the corresponding item(s).

Required per-item updates:

- `Status`
- `What changed` (1-3 bullets)
- `Verification` (tests/checks run)
- `Follow-ups` (if any)

### PR Checklist Snippet

```md
## Refactor Report Update
- [ ] I checked `documentation/REFRACTOR_REPORT.md` for impacted items.
- [ ] I updated status/evidence for touched refactor items.
- [ ] I documented any new follow-up debt introduced by this PR.
```

## 10. Change Log

Track report maintenance history.

| Date | Author | Items Updated | Summary |
|---|---|---|---|
| 2026-02-14 | codex | R-001, R-002 | Added decision-complete task cards, 2-4 week sequencing, and explicit dependencies. |
| 2026-02-14 | codex | R-001 | Implemented orchestration decomposition, legacy isolation, and sync batching/process-page tests. |
| 2026-02-14 | codex | R-002..R-007 | Added comprehensive remaining-work checklist in `documentation/REFRACTOR_TODO.md`. |

## 11. Execution Update (2026-02-14)

### Completion Status

- `R-001`: Done
- `R-002`: Done
- `R-003`: Done
- `R-004`: Done
- `R-005`: Done
- `R-006`: Done
- `R-007`: Done

### Implemented Artifacts

- Convex scan/cleanup decomposition and logic tests:
  - `convex/maintenance/duplicateScan.page.ts`
  - `convex/maintenance/duplicateScan.logic.ts`
  - `convex/maintenance/duplicateCleanup.logic.ts`
  - `convex/snapshots_helpers.ts`
  - `convex_tests/maintenance_duplicate_scan_logic.test.ts`
  - `convex_tests/maintenance_duplicate_cleanup_logic.test.ts`
  - `convex_tests/maintenance_snapshot_cleanup.test.ts`
  - `convex_tests/snapshots_helpers.test.ts`
- Python sync client/mapping refactors:
  - `python/damodaran_sync/convex_client_models.py`
  - `python/damodaran_sync/convex_client_validation.py`
  - `python/damodaran_sync/dataset_mappings_seed.py`
  - `python/damodaran_sync/dataset_mappings_validation.py`
- SEC EDGAR decomposition:
  - `python/dcf_engine/service/sec_edgar.py`
  - `python/dcf_engine/service/sec_edgar_http.py`
  - `python/dcf_engine/service/sec_edgar_cache.py`
  - `python/dcf_engine/service/sec_edgar_extract.py`
  - `python/dcf_engine/service/sec_edgar_models.py`
  - `python/tests/test_sec_edgar.py`
  - `python/tests/fixtures/sec_edgar/*.json`
- Frontend state decoupling:
  - `app/page.tsx`
  - `lib/contexts/WorkbenchContext.tsx`
  - `lib/hooks/useWorkbenchViewState.ts`
  - `test/workbenchContext.test.ts`
  - `test/dashboardPageState.test.ts`

### Verification Run Log

- `cd python && ../.venv/bin/pytest` -> `93 passed`
- `bun test` -> `37 passed`
- `bun run build` -> success
- `bunx convex typecheck` -> success

### Change Log Addendum

| Date | Author | Items Updated | Summary |
|---|---|---|---|
| 2026-02-14 | codex | R-002..R-007 | Refactor backlog executed and validated across Python, Convex, and frontend suites. |
