# DCF Engine end-to-end: deterministic core, Convex reference, persistence, and golden tests

This ExecPlan is a living document. The sections Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective must be kept up to date as work proceeds.

This document must be maintained in accordance with .agent/PLANS.md from the repository root.

## Purpose / Big Picture

After this work, a developer can run a deterministic discounted cash flow (DCF) valuation from the Python CLI using a YAML config, optionally resolve missing assumptions from Convex reference data, and optionally persist a valuation run back into Convex for UI consumption. They can verify the system by running pytest, invoking the CLI on a sample config, and observing a JSON output that includes normalized inputs, optional trace tables, and provenance describing exactly which reference snapshot and columns were used.

## Progress

- [x] (2026-01-10 09:52Z) Confirmed repository contains .agent/PLANS.md and an existing ExecPlan file.
- [x] (2026-01-10 09:52Z) Merged user-provided ExecPlan content with PLANS.md requirements in .agent/execplan-dcf-engine.md.
- [x] (2026-01-10 09:46Z) Review existing Convex and damodaran_sync code paths for constraints and align plan details.
- [x] (2026-01-10 09:52Z) Milestone 1: Python dcf_engine skeleton, CLI, and smoke tests (implementation present in repo).
- [x] (2026-01-10 09:52Z) Added python/tests/conftest.py so pytest can import packages when rootdir is the repo root.
- [x] (2026-01-10 10:02Z) Created `.venv` and installed python/requirements.txt for local validation.
- [x] (2026-01-10 10:06Z) Validate Milestone 1 by running pytest and CLI help; CLI help passes via venv and pytest passes with LD_LIBRARY_PATH pointing at gcc-13.2.0-lib.
- [x] (2026-01-10 10:06Z) Milestone 2 implementation done (primaryKeyNorm schema/indexes, reference queries, ingestion updates, CLI force rebuild, normalization test); Convex type regen now passes after making primaryKeyNorm optional.
- [x] (2026-01-10 10:19Z) Set DAMODARAN_SYNC_TOKEN in Convex and local .env.local for rebuild access.
- [x] (2026-01-10 10:25Z) Added forceRebuild override for snapshots:upsertByIdentity and made Convex client accept float counts from mutations.
- [x] (2026-01-10 12:18Z) Added primaryKeyNormComplete snapshot flag plus status-primarykeynorm command and skip logic based on the flag.
- [x] (2026-01-10 12:27Z) Adjusted status and skip logic to use the snapshot-level primaryKeyNormComplete flag for fast checks.
- [ ] (2026-01-10 12:27Z) Follow-up: run sync-current --force-rebuild to completion so snapshots set primaryKeyNormComplete, then switch schema back to required.
- [x] (2026-01-10 13:50Z) Milestone 3: DCF core specification and schema expansion (spec_fcff.md + expanded schema models).
- [x] (2026-01-10 14:47Z) Milestone 4: Deterministic numeric implementation with unit tests (pytest passes).
- [x] (2026-01-10 14:47Z) Milestone 5: Convex-aware normalization and provenance (pytest + Convex-backed CLI run succeeded).
- [x] (2026-01-10 14:47Z) Milestone 6: CLI usability, config schema, and exports (CLI help + example config run + CSV export succeeded).
- [x] (2026-01-10 15:35Z) Milestone 7 prep: added Convex valuationRuns/valuationRunTraces schema + valuations endpoints, Python Convex persister, CLI --save-to-convex flag, and tests for trace storage behavior.
- [x] (2026-01-10 15:38Z) Validation: pytest passes with LD_LIBRARY_PATH set for numpy (41 passed).
- [x] (2026-01-10 15:45Z) Milestone 7: Persist valuation runs in Convex (Convex schema regen done; CLI run saved run to Convex).
- [x] (2026-01-10 15:52Z) Milestone 8: Golden tests and hardening (added fixtures + golden test + improved reference error messaging).
- [x] (2026-01-10 15:52Z) Validation: pytest passes with golden tests (43 passed).
- [x] (2026-01-10 15:56Z) Full validation: CLI help, Convex-backed CLI run with --save-to-convex, and pytest (43 passed).
- [x] (2026-01-10 16:08Z) Added additional golden fixtures (high growth + distressed) and labeled fair_value_per_share in result/trace; pytest passes (45 passed).
- [x] (2026-01-10 16:37Z) Cleanup legacy tableData rows to restore required primaryKeyNorm (added backfill-primarykeynorm-all + convex backfill mutation; restored required schema; Convex dev passes; pytest passes).

## Surprises & Discoveries

Observation: Damodaran as-of dates are normalized to ISO yyyy-mm-dd strings before ingestion, so lexicographic ordering is chronological and the existing snapshots by_identity index is sufficient for "latest snapshot" queries.
Evidence: python/damodaran_sync/discover.py uses date.isoformat() when resolving as_of_date, and convex/schema.ts defines snapshots.index("by_identity", ["datasetKey", "regionCode", "asOfDate"]).

Observation: tableData insert batching uses Promise.all, which can create bursty write fan-out.
Evidence: convex/tableData.ts awaits Promise.all over ctx.db.insert.

Observation: tableData rows currently store primaryKey/secondaryKey only (no normalized key) and are indexed by (snapshotId, buildId, primaryKey).
Evidence: convex/schema.ts defines tableData with primaryKey and the by_snapshot_build_primaryKey index.

Observation: snapshots only become queryable via activeBuildId after finalizeRebuild; pendingBuildId is required during rebuilds.
Evidence: convex/snapshots.ts sets activeBuildId in finalizeRebuild and enforces pendingBuildId matches buildId.

Observation: The repository already contains a Damodaran sync pipeline and tests, so the DCF engine work should layer on top of existing ingestion rather than scaffolding a new pipeline.
Evidence: python/damodaran_sync exists and python/tests contains Damodaran-related tests.

Observation: numpy cannot import due to a missing libstdc++.so.6 in this environment, which prevents pandas-backed tests from running.
Evidence: Importing numpy raises \"libstdc++.so.6: cannot open shared object file: No such file or directory\" and pytest fails on tests/test_excel_parse.py.

Observation: The base Python environment is externally managed (no pip), so dependencies must be installed in a local venv.
Evidence: `python -m pip install -r python/requirements.txt` fails with "No module named pip" and `python -m ensurepip --upgrade` fails with "externally-managed-environment".

Observation: Convex schema regeneration fails against existing data because legacy tableData rows do not include primaryKeyNorm.
Evidence: `bunx convex dev --once` fails with "Document ... in table \"tableData\" does not match the schema: Object is missing the required field `primaryKeyNorm`."

Observation: numpy/pandas imports work when libstdc++.so.6 is provided via LD_LIBRARY_PATH from the Nix gcc lib output.
Evidence: `LD_LIBRARY_PATH=/nix/store/xvzz97yk73hw03v5dhhz3j47ggwf1yq1-gcc-13.2.0-lib/lib ... pytest -q` completes with 32 passed.

Observation: Damodaran sync requires DAMODARAN_SYNC_TOKEN; without it, Convex mutations fail and backfill cannot proceed.
Evidence: `damodaran_sync.cli sync-current --force-rebuild` fails with "Missing DAMODARAN_SYNC_TOKEN" in syncLogs:create.

Observation: Convex returns numbers as floats in Python, so insertBatch may return {"inserted": 100.0}.
Evidence: damodaran_sync sync-current raised "Unexpected tableData:insertBatch response: {'inserted': 100.0}" until Convex client cast float to int.

Observation: Sync-current rebuilds can fail for specific snapshots if a rebuild is already in progress.
Evidence: snapshots:upsertByIdentity returns "Snapshot rebuild already in progress" for ctryprem.xlsx during sync-current.

Observation: deleteBySnapshotBuild also returns float counts in Python clients.
Evidence: sync-current reported "Unexpected tableData:deleteBySnapshotBuild response: {'deleted': 1000.0}" before the client coerced float to int.

Observation: A lightweight completion check can rely on a snapshot-level primaryKeyNormComplete flag instead of scanning tableData.
Evidence: status-primarykeynorm reports zero complete snapshots because existing snapshots lack the new flag.

Observation: Convex disallows multiple paginated queries inside a single query, so completion checks cannot paginate server-side.
Evidence: tableData:hasMissingPrimaryKeyNorm failed with "Convex only supports a single paginated query in each function."

Observation: Convex optional args reject null; they must be omitted or undefined.
Evidence: valuations:create failed with ArgumentValidationError when error was sent as null.

Observation: Legacy tableData rows across multiple snapshots lacked primaryKeyNorm, so backfill needed a global scan.
Evidence: bunx convex dev --once repeatedly failed with different snapshot/build IDs until backfill-primarykeynorm-all filled ~176k rows.

## Decision Log

Decision: Use the existing snapshots by_identity index on (datasetKey, regionCode, asOfDate) and rely on ISO yyyy-mm-dd ordering rather than adding asOfDateTs.
Rationale: The ingestion path normalizes dates with date.isoformat(), so string ordering is stable and avoids schema churn.
Date/Author: 2026-01-09 / Codex

Decision: Make the DCF numeric core Convex-free and fully test-driven before integrating any reference lookups.
Rationale: It isolates deterministic math from data availability and keeps failures local to the numeric implementation.
Date/Author: 2026-01-09 / Codex

Decision: Use primaryKeyNorm as the stable lookup key for Damodaran rows and record resolved column headers in provenance.
Rationale: Damodaran column naming varies over time, so normalization plus explicit provenance preserves reproducibility.
Date/Author: 2026-01-09 / Codex

Decision: Persist large trace payloads in a separate Convex table when saving runs.
Rationale: Convex document size limits can be exceeded by full trace tables; a split avoids write failures.
Date/Author: 2026-01-09 / Codex

Decision: Cap reference snapshot scans at 50 candidates and return null if no activeBuildId is present.
Rationale: Avoids unbounded scans while still covering expected snapshot histories.
Date/Author: 2026-01-10 / Codex

Decision: Temporarily make tableData.primaryKeyNorm optional to allow Convex schema regeneration against legacy rows.
Rationale: Existing data lacks the new field; this unblocks local development while a rebuild/backfill strategy is prepared.
Date/Author: 2026-01-10 / Codex

Decision: Allow forceRebuild to override snapshots stuck in "rebuilding" and coerce float counts from Convex mutations to ints.
Rationale: Sync runs can be interrupted, leaving pending builds; Convex returns numbers as floats, so the client must accept them.
Date/Author: 2026-01-10 / Codex

Decision: Use a snapshot-level primaryKeyNormComplete flag for completion checks and skip logic.
Rationale: Avoids scanning large tableData payloads and makes the status command fast and deterministic.
Date/Author: 2026-01-10 / Codex

Decision: Do not paginate inside Convex query functions; use snapshot-level flags for progress and skip logic.
Rationale: Convex restricts functions to a single paginated query per execution, making server-side scans infeasible.
Date/Author: 2026-01-10 / Codex

## Outcomes & Retrospective

The DCF engine now runs end-to-end with deterministic math, optional Convex-backed normalization, and optional persistence of valuation runs and traces back into Convex. The CLI can run with a YAML config, export JSON and forecast CSV, and save runs for later UI use. Golden tests and hardened error messages make regressions and missing reference data easier to detect, and the output now labels fair_value_per_share alongside value_per_share. The primaryKeyNorm schema has been restored to required after a global backfill; future work can add even more golden fixtures or broader reference datasets.

## Context and Orientation

This repository is a monorepo with two main surfaces used by this work. Convex is the backend data store and query/mutation runtime used by this repo; its schema lives in convex/schema.ts and its functions live in convex/*.ts. Python code lives under python/, where python/damodaran_sync implements a Damodaran ingestion pipeline and python/tests contains tests. The new DCF engine will be added under python/dcf_engine with tests under python/tests.

A "discounted cash flow (DCF)" valuation is the process of projecting future free cash flows and discounting them back to present value. This plan implements a Free Cash Flow to the Firm (FCFF) model, meaning the cash flow belongs to all capital providers and is later bridged to equity value by subtracting debt and adding cash. A "snapshot" is a dataset at a specific as-of date and region, stored in Convex with metadata in snapshots and row data in tableData. A "build" is a specific ingest attempt; snapshots can be rebuilt, and activeBuildId marks the current build to read from. The "primaryKeyNorm" is a normalized version of a Damodaran row key, used to make lookups robust to punctuation and case differences.

## Plan of Work

### Milestone 1: Python dcf_engine skeleton (Convex-free) and baseline tests

This milestone creates a minimal python/dcf_engine package that can be imported and run locally without Convex. It defines a small schema, a simple present value calculation, and a CLI that reads a YAML or JSON config. At the end of the milestone, pytest passes and a developer can run a smoke valuation from python/ using python -m dcf_engine.cli run.

Work to perform includes creating python/dcf_engine/__init__.py, python/dcf_engine/schema.py, python/dcf_engine/engine.py, python/dcf_engine/cli.py, python/dcf_engine/io/__init__.py, and python/dcf_engine/io/config_loader.py. The schema should define InputAssumptions, ValuationResult, and Trace (pydantic v2 BaseModel). The engine should compute the present value of a constant FCFF stream discounted by a constant WACC. The CLI should expose a run command that loads YAML or JSON and prints or writes a JSON summary.

Tests to add include python/tests/test_engine_smoke.py and python/tests/test_config_loader.py. The smoke test should verify a known geometric present value sum.

### Milestone 2: Convex reference layer and stable row lookup with primaryKeyNorm

This milestone makes Convex reads deterministic and robust by adding a read-only convex/reference.ts module and by extending tableData to include a normalized primary key. It also updates the Damodaran ingestion path to compute and persist primaryKeyNorm, plus a Python unit test for the normalization rule.

Convex changes include adding primaryKeyNorm to the tableData schema, adding an index on (snapshotId, buildId, primaryKeyNorm), and optionally adding a secondary-key index when a row has a secondaryKey. convex/tableData.ts should accept and store primaryKeyNorm and insert rows sequentially rather than with Promise.all to avoid bursty fan-out. A new convex/reference.ts should define read-only queries reference:getLatestSnapshot, reference:getSnapshotAtOrBefore, and reference:getRow. These queries must always use activeBuildId, must ignore snapshots without activeBuildId, and must return a clear error when a secondary key is required for disambiguation but missing.

Python ingestion changes include adding normalize_primary_key to python/damodaran_sync/transform.py, adding primary_key_norm to the NormalizedRow payload, and sending primaryKeyNorm in python/damodaran_sync/sync.py. The normalization rule is: lowercase the key, replace non-alphanumeric with spaces, collapse multiple spaces, and strip. The example "  Software - (Entertainment) " must normalize to "software entertainment". Update python/damodaran_sync/cli.py to add --force-rebuild to sync-current and sync-all so a rebuild can backfill primaryKeyNorm.

### Milestone 3: DCF core specification and full schema for traceable runs

This milestone defines the exact mathematics and data model used by the engine so later code and tests follow a stable spec. It creates python/dcf_engine/docs/spec_fcff.md with unambiguous time indexing and definitions of all derived series. It also expands python/dcf_engine/schema.py to include inputs, normalized inputs, schedules, forecast tables, present value tables, bridge tables, results, and trace structures, all JSON-serializable.

The spec must clearly define time indexing: t=0 is the base year, t=1..10 are explicit forecast years, and t=11 is the terminal year used to compute terminal value as of t=10. It must define revenues, margins, EBIT, after-tax EBIT, reinvestment, invested capital, FCFF, discount factors, terminal value, and equity bridge adjustments, and it must specify how reinvestment lag is applied.

### Milestone 4: Deterministic numeric implementation with unit tests

This milestone implements the numeric core in small, testable modules and wires them through DCFEngine.run. Create python/dcf_engine/schedules.py, forecast.py, discounting.py, and bridge.py, and extend python/dcf_engine/engine.py to assemble results and trace tables.

Schedules must be deterministic and explicit about length and indexing. Forecast logic must support a configurable reinvestment lag, with tests covering boundary years and terminal-year rules. Discounting must compute discount factors from the WACC schedule, compute PV of FCFF for years 1..10, compute terminal value, and validate that wacc_stable is greater than g_stable. Bridge logic must apply failure or distress adjustments and compute equity value and value per share using clear sign conventions.

Tests to add include python/tests/test_schedules.py, python/tests/test_forecast_reinvestment_lag.py, python/tests/test_forecast_nol.py, python/tests/test_discounting.py, python/tests/test_bridge.py, and any additional small tests needed for off-by-one and validation cases.

### Milestone 5: Convex-aware normalization and provenance

This milestone allows users to provide partial inputs and have missing assumptions resolved from Convex, while recording an audit trail of exactly what data was used. It adds a reference provider interface and a Convex implementation that calls reference:getLatestSnapshot, reference:getSnapshotAtOrBefore, and reference:getRow. It also adds dataset-specific profiles that map Damodaran columns into canonical metrics, and a normalization pass that merges user inputs with reference lookups to produce normalized inputs and provenance.

New modules include python/dcf_engine/reference/provider.py, python/dcf_engine/reference/convex_provider.py, python/dcf_engine/reference/profiles/ (with one profile per dataset, such as wacc, taxrate, margin, and betas), and python/dcf_engine/normalization.py. The provenance model in schema.py must include dataset key, region, snapshot id, as-of date, active build id, primary key norm, and the exact column headers used for each resolved metric. Tests should mock ConvexClient to verify query names and arguments, and validate that missing inputs are filled and provenance is complete.

### Milestone 6: CLI usability, config schema, and exports

This milestone makes the engine usable from the command line with reproducible configuration files. Add python/configs/example.yaml and extend python/dcf_engine/io/config_loader.py to load YAML or JSON into InputAssumptions, including selectors for reference lookups (industry, region, and policy of latest versus at-or-before). Add python/dcf_engine/io/export.py to export JSON results and at least one CSV table (the forecast table). Extend python/dcf_engine/cli.py with run options for --use-convex, --include-trace, and --out, and ensure clear non-zero exits when required reference data is missing.

### Milestone 7: Persist valuation runs in Convex

This milestone makes valuation runs queryable from Convex for a future UI. Add a valuationRuns table in convex/schema.ts that stores createdAt, engineVersion, status, error, inputs, normalized inputs, provenance references, and a result summary. Add a valuationRunTraces table for large trace payloads, indexed by runId. Implement convex/valuations.ts with create, get, and listBySymbol queries or mutations as appropriate. Add python/dcf_engine/persist/convex_runs.py to call these endpoints, with logic to store traces separately when they exceed a MAX_TRACE_BYTES threshold. Extend the CLI with --save-to-convex and output the returned run id.

### Milestone 8: Golden tests and hardening

This milestone proves the engine matches an external reference (Excel) within tolerance and improves error reporting for missing references and invalid numeric constraints. Add python/tests/fixtures/<symbol>_inputs.yaml and <symbol>_expected_outputs.json, and implement python/tests/test_engine_golden_<symbol>.py to compare output within tolerance. The engine must fail fast for invalid constraints such as wacc_stable <= g_stable, non-positive shares, and non-positive sales-to-capital where applicable, and must report which dataset, snapshot, and column failed to resolve when a reference lookup fails.

## Concrete Steps

Run the following commands as you progress through the milestones. These commands are safe to re-run and are intended to provide visible proof that each milestone is working.

From the repository root, regenerate Convex types after schema or query changes:

    bunx convex dev --once

From python/, run tests and the CLI smoke command:

    cd python
    pytest -q
    python -m dcf_engine.cli --help

From python/, run the example config with Convex (example.yaml leaves reference fields null intentionally):

    cd python
    python -m dcf_engine.cli run --config configs/example.yaml --use-convex --out ../out/run.json

If a local Convex dev deployment is needed, start it from the repository root in a separate terminal:

    bunx convex dev

## Validation and Acceptance

The implementation is complete when pytest passes from python/ and the new tests demonstrate the DCF core behavior and edge cases. The CLI must successfully run a valuation using configs/example.yaml and produce a JSON output that includes inputs, normalized inputs, a result summary, and optional trace tables. When --use-convex is enabled and CONVEX_URL is set, the engine must resolve reference inputs and record provenance pinned to activeBuildId. When --save-to-convex is enabled, the CLI must create a valuationRuns record and print its id, and a large trace must be stored in valuationRunTraces rather than failing the write. The golden test must pass within a documented tolerance.

## Idempotence and Recovery

All changes are additive and safe to re-run. Re-running bunx convex dev --once regenerates Convex types without destructive side effects. Re-running damodaran_sync sync-current or sync-all is safe; use --force-rebuild to force a new build when snapshots are unchanged. If a trace write exceeds size limits, re-run with --include-trace disabled or increase MAX_TRACE_BYTES and re-run the save step. If a schema change causes Convex errors, revert to the last working schema and regenerate types to recover.

## Artifacts and Notes

Example CLI help excerpt, which should appear after the CLI is added:

    usage: dcf_engine run --config CONFIG [--use-convex] [--include-trace] [--out OUT]

Example pytest summary after implementing core tests:

    20 passed in 2.34s

Example reference usage for manual verification:

    provider = ConvexReferenceProvider()
    snapshot = provider.get_latest_snapshot("wacc", "us")
    row = provider.get_row("wacc", "us", primaryKeyNorm="software entertainment")

## Interfaces and Dependencies

Add pydantic>=2.0.0 and pyyaml>=6.0.0 to python/requirements.txt. Continue to rely on existing Convex client dependencies already in the repository.

Define these interfaces and signatures as stable contracts that later steps rely on.

In python/dcf_engine/engine.py, define:

    class DCFEngine:
        def run(self, inputs: InputAssumptions) -> tuple[ValuationResult, Trace]:
            ...

In python/dcf_engine/io/config_loader.py, define:

    def load_config(path: str) -> tuple[InputAssumptions, ReferenceSelector | None]:
        ...

In python/dcf_engine/reference/provider.py, define:

    class ReferenceProvider(Protocol):
        def get_latest_snapshot(self, datasetKey: str, regionCode: str) -> SnapshotRef: ...
        def get_snapshot_at_or_before(self, datasetKey: str, regionCode: str, targetDate: str) -> SnapshotRef | None: ...
        def get_row(
            self,
            datasetKey: str,
            regionCode: str,
            asOfDate: str | None,
            primaryKeyNorm: str,
            secondaryKey: str | None = None,
        ) -> RowRef | None: ...

In python/dcf_engine/normalization.py, define:

    def normalize_inputs(
        inputs: InputAssumptions,
        provider: ReferenceProvider | None,
        selector: ReferenceSelector | None = None,
    ) -> tuple[NormalizedAssumptions, Provenance]:
        ...

In convex/reference.ts, define the following read-only query names as part of the external contract:

    reference:getLatestSnapshot
    reference:getSnapshotAtOrBefore
    reference:getRow

Plan Change Notes: 2026-01-09 Merged user-provided ExecPlan content with existing plan and aligned the document to .agent/PLANS.md requirements, resolving conflicts on snapshot indexing and trace storage, and added a plain-language Convex definition. 2026-01-09 Marked Milestone 1 implemented and noted validation pending due to missing dependencies in the environment. 2026-01-09 Updated progress with test import fix and recorded numpy/libstdc++ validation blocker. 2026-01-10 Marked the Convex/damodaran review complete, captured new environment blockers, noted Milestone 2 implementation progress, and recorded the snapshot scan cap decision. 2026-01-10 Recorded venv requirement, validation attempts, and Convex schema regeneration failure due to legacy tableData rows missing primaryKeyNorm. 2026-01-10 Added the LD_LIBRARY_PATH workaround for numpy, marked validations passing, and documented the temporary optional primaryKeyNorm schema decision. 2026-01-10 Recorded the failed backfill attempt due to missing DAMODARAN_SYNC_TOKEN. 2026-01-10 Added forceRebuild override, float count coercion, and noted the ongoing backfill run requirement. 2026-01-10 Added primaryKeyNormComplete flag, status command, and skip logic for completion checks. 2026-01-10 Updated completion checks to rely on snapshot flags after Convex pagination limits. 2026-01-10 Added valuation run persistence (schema + Convex functions + CLI), golden test fixtures, improved reference error messaging, updated validation steps, and recorded full validation. 2026-01-10 Added extra golden fixtures, updated fair_value_per_share labeling, revalidated tests, and completed a global primaryKeyNorm backfill with new backfill-primarykeynorm-all tooling.
