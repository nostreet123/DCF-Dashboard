# Convex Database Layer Hardening

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This document must be maintained in accordance with `.agent/PLANS.md`.

## Purpose / Big Picture

The hardening work described here is already present in the repository. A contributor reading this document today should be able to verify, rather than re-implement, five operational safety improvements in the Convex database layer. The repository now includes integration tests that exercise the Build ID lifecycle against real Convex handlers, a single canonical snapshot-selection helper shared by the main and maintenance paths, typed helper contexts in the original target files, a Python-vs-TypeScript seed parity test, and bounded metrics counts for large tables.

The practical value of this document is twofold. First, it shows a novice where those protections live and how to confirm they still work once the local toolchain is installed. Second, it records the design decisions and follow-up boundaries so future hardening work can start from a stable baseline instead of reopening already completed milestones.

## Progress

- [x] (2026-03-04 00:00Z) Sprint 1, Milestone 1 completed: consolidated snapshot scoring by routing `pickSnapshotKeepId` through `pickBestSnapshot`.
- [x] (2026-03-04 00:00Z) Sprint 1, Milestone 2 completed: replaced the original `any`-typed helper contexts in `convex/snapshots_helpers.ts` and `convex/requestIdDedupe.ts`.
- [x] (2026-03-05 00:00Z) Sprint 1, Milestone 3 completed: added `convex_tests/buildIdLifecycle.test.ts` with Build ID lifecycle integration coverage.
- [x] (2026-03-05 00:00Z) Sprint 2, Milestone 4 completed: added `python/tests/test_seed_parity.py` to keep TS and Python seed data in sync.
- [x] (2026-03-05 00:00Z) Sprint 2, Milestone 5 completed: changed `convex/metrics.ts` to use bounded counts for large tables.
- [x] (2026-03-30 00:00Z) Refreshed this ExecPlan so it now describes the current repository state, documents environment prerequisites for verification, and marks broader Convex `any` cleanup as future work rather than part of these completed milestones.
- [x] (2026-03-30 00:00Z) Executed the refreshed verification path: bootstrapped local dependencies, installed a workspace-local Bun runtime plus Homebrew Python 3.12, and re-ran the canonical Bun, Convex typecheck, seed parity, and full Python test commands successfully.
- [x] (2026-04-06 00:00Z) Corrected the runnable verification path so the ExecPlan now bootstraps the repo-local Bun and Python toolchain explicitly, uses repo-local verification commands, and inspects enough of `convex_tests/buildIdLifecycle.test.ts` to cover the auth-enforcement case.

## Surprises & Discoveries

- Observation: `pickBestSnapshot` had to become generic as `pickBestSnapshot<T extends SnapshotPick>(snapshots: T[]): T | null` so callers in `convex/snapshots.ts` could retain full snapshot document typing.
  Evidence: `convex/snapshots_helpers.ts` now exports the generic signature and `convex/maintenance/shared.ts` consumes it without redefining the scoring loop.

- Observation: `convex/requestIdDedupe.ts` still needs `as unknown as T` casts even after the helper context was typed, because querying a union of tables produces a union of document types that TypeScript cannot narrow directly to the generic callback type.
  Evidence: `convex/requestIdDedupe.ts` uses `DatabaseReader` but preserves casts on the returned matches.

- Observation: Bun does not support `import.meta.glob`, which `convex-test` expects for module discovery.
  Evidence: `convex_tests/buildIdLifecycle.test.ts` builds a manual module map with `Bun.Glob` before calling `convexTest(schema, modules)`.

- Observation: TypeScript seed extraction was more robust via a Node subprocess than by regex-only parsing.
  Evidence: `python/tests/test_seed_parity.py` shells out to `node -e` and reconstructs the seed structures before comparing them to Python constants.

- Observation: The current shell used for this refresh does not have `bun`, `bunx`, or pytest on `PATH`, so the canonical validation commands could not be re-run during the documentation update.
  Evidence: `which bun bunx pytest` returned `not found`, while `node` and `python3` were present.

- Observation: The machine’s default Python 3.9 environment was too old for the pinned Python toolchain, but a local Python 3.12 environment resolved the issue cleanly.
  Evidence: `python3 -m venv .venv` with the system Python failed during dependency resolution, while `/opt/homebrew/bin/python3.12 -m venv .venv` installed `python/requirements-dev.txt` successfully and `cd python && pytest` passed.

- Observation: Referring readers to `AGENTS.md` and `convex/AGENTS.md` was not enough to recover from a shell where `bun`, `bunx`, and `pytest` were missing from `PATH`.
  Evidence: the checked-in setup docs invoke `bun`/`bunx` directly and install `python/requirements.txt`, while the successful refresh path in this workspace depended on `./.bun-home/bin/bun`, `./.bun-home/bin/bunx`, and `python/requirements-dev.txt` inside `.venv`.

## Decision Log

- Decision: Order sprint 1 as DRY → types → integration tests.
  Rationale: Consolidating the scoring function first means the integration tests exercise the canonical version. Fixing types second means the tests import the intended helper shapes instead of code that is about to move.
  Date/Author: 2026-03-04 / assistant

- Decision: Use `convex-test` for integration tests rather than a custom harness.
  Rationale: `convex-test` provides an in-memory Convex backend and matches the project’s Bun-based test stack, which keeps the tests close to real handler behavior without adding bespoke infrastructure.
  Date/Author: 2026-03-04 / assistant

- Decision: Keep the metrics optimization as bounded counts rather than adding a counter table.
  Rationale: Counter rows would need cross-cutting maintenance across many write paths. The reference tables are small enough for exact collection, while `snapshots` and `tableData` benefit from bounded `.take(N + 1)` reads without schema changes.
  Date/Author: 2026-03-04 / assistant

- Decision: Use `.collect()` for reference tables instead of pagination in `convex/metrics.ts`.
  Rationale: `categories`, `regions`, and `datasets` are small and seed-driven, so exact collection is simpler and cheaper than paginated counting. Only the large tables need bounded counts.
  Date/Author: 2026-03-05 / assistant

- Decision: Use a Node subprocess for TypeScript seed extraction in the parity test.
  Rationale: Evaluating the extracted array literals is less brittle than hand-maintaining a regex parser for nested TypeScript object literals and derived mapping structures.
  Date/Author: 2026-03-05 / assistant

- Decision: Treat this ExecPlan as a completion record plus maintenance reference, and defer broader Convex `any` cleanup to a separate future plan.
  Rationale: The original milestones are complete, but the repo still contains other `any`-typed query builders in files outside the original scope such as `convex/reference.ts`, `convex/catalog.ts`, `convex/assets.ts`, and maintenance helpers. Folding that work into this document would blur the boundary between completed hardening and new follow-up hardening.
  Date/Author: 2026-03-30 / assistant

- Decision: Make the verification instructions self-contained and default them to the repo-local Bun and Python toolchain.
  Rationale: The documented shell state for this refresh did not have `bun`, `bunx`, or `pytest` on `PATH`, so the ExecPlan must include the exact bootstrap and verification commands that actually worked in this workspace instead of assuming the reader can infer them from other docs.
  Date/Author: 2026-04-06 / assistant

## Outcomes & Retrospective

The original five milestones are complete and their artifacts are still present in the repository. The database layer now has end-to-end Build ID lifecycle coverage in Bun, consolidated snapshot-selection logic, safer helper typing in the original target files, automated seed parity protection, and bounded counts for large metrics tables.

Historically recorded validation from the implementation pass was:

- `bun test convex_tests`
- `bunx convex typecheck`
- `cd python && pytest`

During the initial documentation refresh, static inspection confirmed that the milestone artifacts still exist in the expected files, but the canonical commands could not be re-run until the local toolchain was bootstrapped. That bootstrap is now complete for this workspace: `npm ci` installed the Node dependencies, `.bun-home/bin/bun` provided Bun 1.3.11, Homebrew supplied Python 3.12.13, and a local `.venv` installed the pinned Python requirements.

The current verification results from this workspace are:

- `./.bun-home/bin/bun test convex_tests` -> 42 passed, 0 failed
- `./.bun-home/bin/bun test convex_tests/buildIdLifecycle.test.ts` -> 4 passed, 0 failed
- `./.bun-home/bin/bunx convex typecheck` -> passed
- `. .venv/bin/activate && cd python && pytest tests/test_seed_parity.py` -> 9 passed
- `. .venv/bin/activate && cd python && pytest` -> 127 passed, 2 warnings

The main lesson from this refresh is that living plans need periodic maintenance even after the code lands. Several narrative sections had become stale and were describing already-shipped behavior as future work. That is now corrected, and the remaining wider type-hardening opportunities are explicitly called out as a separate follow-up area.

A smaller follow-up correction was still necessary after the first refresh. The plan now tells the reader exactly how to recreate the repo-local Bun and Python toolchain that was used here, and its static-inspection step now reads far enough into `convex_tests/buildIdLifecycle.test.ts` to include the auth-enforcement scenario it cites.

## Context and Orientation

The Convex database layer lives in `convex/`, with generated types in `convex/_generated/`, Bun tests in `convex_tests/`, and mirrored seed data on the Python side in `python/damodaran_sync/`. The core write pattern is the Build ID lifecycle: `snapshots:upsertByIdentity` starts or reuses a rebuild, `tableData:insertBatch` writes rows for a specific build, `snapshots:finalizeRebuild` promotes the pending build to the active build, and `tableData:deleteBySnapshotBuild` removes obsolete rows from the previous build. Readers only follow the active build, which prevents partial rebuilds from leaking into query results.

The files that matter for this completed hardening work are:

- `convex/snapshots_helpers.ts`, which now exports the generic `pickBestSnapshot<T extends SnapshotPick>(...)` helper and uses `DatabaseReader` in `findSnapshotByIdentity`.
- `convex/maintenance/shared.ts`, which now implements `pickSnapshotKeepId(...)` by delegating to `pickBestSnapshot(...)` and returning `best?._id ?? null`.
- `convex/requestIdDedupe.ts`, which now uses `DatabaseReader` instead of `ctx: { db: any }` in the original scope targeted by this hardening.
- `convex/metrics.ts`, which now returns exact counts for reference tables and bounded counts for `snapshots` and `tableData`, including `isSnapshotsCapped` and `isTableDataCapped`.
- `convex_tests/buildIdLifecycle.test.ts`, which exercises the happy path, rebuild path, unchanged path, and auth enforcement against real Convex handlers through `convex-test`.
- `python/tests/test_seed_parity.py`, which compares TypeScript and Python seed structures so either side fails loudly when they drift.

There are still additional `any`-typed query builders elsewhere in the Convex tree. They are intentionally out of scope for this document. This plan records the completed hardening slice only.

## Plan of Work

The work for this document is no longer to implement the hardening itself. The work is to keep the hardening story accurate and verifiable for the next contributor.

Begin by statically confirming that the repository still contains the milestone artifacts in the files named above. Do not assume the plan is correct just because the progress section is checked. Read the helpers, the integration test, the parity test, and the metrics query so the prose stays anchored in the code rather than in memory.

Next, update any stale narrative that still describes completed code as future work. In practice that means the purpose statement, the context section, the plan narrative, the concrete steps, and the acceptance criteria. Keep the original design rationale where it is still useful, but rewrite implementation instructions into verification instructions. The next contributor should come away knowing what exists, why it exists, and how to confirm it still behaves as intended once the toolchain is available.

Finally, keep the boundary of this ExecPlan crisp. Mention that the broader cleanup of remaining Convex `any` usage is valuable future work, but do not smuggle that larger effort into the definition of done for this document. This plan is finished work plus maintenance guidance, not an umbrella for every remaining type-safety improvement in the database layer.

## Concrete Steps

All commands below are intended to run from the repository root.

Before running the canonical verification commands, ensure the repo-local toolchain exists. This refresh was performed in a shell where `node` and `python3` were present but `bun`, `bunx`, and pytest were missing from `PATH`, so the recovery path must be explicit rather than delegated to other docs.

Bootstrap the workspace exactly as follows. The successful refresh used `/opt/homebrew/bin/python3.12`; if your machine exposes Python 3.12 at a different path, substitute that binary in the `venv` creation step.

    npm ci
    if [ ! -x ./.bun-home/bin/bun ]; then
      curl -fsSL https://bun.sh/install | env BUN_INSTALL="$PWD/.bun-home" bash
    fi
    if [ -d .venv ]; then
      . .venv/bin/activate
    else
      /opt/homebrew/bin/python3.12 -m venv .venv
      . .venv/bin/activate
    fi
    python -m pip install --upgrade pip
    python -m pip install -r python/requirements-dev.txt

Use these static inspection commands to confirm the milestone artifacts are still present before editing the plan text:

    sed -n '1,220p' convex/snapshots_helpers.ts
    sed -n '1,220p' convex/maintenance/shared.ts
    sed -n '1,220p' convex/requestIdDedupe.ts
    sed -n '1,220p' convex/metrics.ts
    sed -n '1,340p' convex_tests/buildIdLifecycle.test.ts
    sed -n '1,260p' python/tests/test_seed_parity.py

Once the toolchain is installed, use the canonical repo validation commands:

    ./.bun-home/bin/bun test convex_tests
    ./.bun-home/bin/bunx convex typecheck
    . .venv/bin/activate && cd python && pytest

## Validation and Acceptance

Acceptance for this refresh is documentation accuracy first and code verification second.

The documentation portion is complete when both copies of the ExecPlan describe the current repository state, no section still frames the shipped milestones as pending implementation work, the progress entries are timestamped, the living sections reflect the code that is present today, and the document ends with a revision note explaining why it was refreshed.

The repository verification portion is complete once a contributor can run the repo-local verification commands:

    ./.bun-home/bin/bun test convex_tests
    ./.bun-home/bin/bunx convex typecheck
    . .venv/bin/activate && cd python && pytest

and observe that the Bun test suite includes `convex_tests/buildIdLifecycle.test.ts`, the Python test suite includes `python/tests/test_seed_parity.py`, and the typecheck accepts the interfaces documented here. If the toolchain is unavailable, static inspection of the named files is the fallback proof for this document refresh, but it does not replace the canonical verification commands for future contributors.

## Idempotence and Recovery

This refresh is safe to repeat. The only expected edits are to the two mirrored ExecPlan files. If one copy is updated and the other is not, restore parity immediately by copying the finalized text across and re-checking that both files are identical. No schema changes, data migrations, or runtime mutations are part of this refresh.

## Artifacts and Notes

The most important artifact is the presence of the completed milestone files themselves:

    convex_tests/buildIdLifecycle.test.ts
    python/tests/test_seed_parity.py
    convex/metrics.ts
    convex/snapshots_helpers.ts
    convex/maintenance/shared.ts
    convex/requestIdDedupe.ts

The most important follow-up note is that wider Convex type-hardening remains available work, but it is intentionally outside the scope of this document. A future plan should start by reviewing the remaining `any` usage in files such as `convex/reference.ts`, `convex/catalog.ts`, `convex/assets.ts`, and maintenance helpers.

## Interfaces and Dependencies

This refresh adds no new production dependencies and introduces no API changes. It documents the interfaces that now exist:

    pickBestSnapshot<T extends SnapshotPick>(snapshots: T[]): T | null
    pickSnapshotKeepId(snapshots: SnapshotPick[]): Id<"snapshots"> | null
    metrics:getCounts -> {
      categories,
      regions,
      datasets,
      snapshots,
      isSnapshotsCapped,
      tableData,
      isTableDataCapped,
    }

The key test entry points remain:

    bun test convex_tests/buildIdLifecycle.test.ts
    cd python && pytest tests/test_seed_parity.py

Revision note (2026-03-30): Updated this ExecPlan because the implementation already landed and the previous prose had become stale. The refresh converts the document from a forward-looking implementation plan into an accurate completion record and maintenance reference, explicitly defers broader Convex `any` cleanup to a separate future plan, and now records a successful local re-run of the canonical validation flow after bootstrapping Bun and Python 3.12 in the workspace.

Revision note (2026-04-06): Corrected the runnable verification path after review. The plan now bootstraps the repo-local Bun and Python toolchain explicitly, uses the repo-local verification commands that were actually proven in this workspace, and extends the static inspection range for `convex_tests/buildIdLifecycle.test.ts` so the auth-enforcement case is visible during review.
