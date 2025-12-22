# Phase 8: Convex mutations and queries


This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.


This plan follows `.agents/PLANS.md` and must be maintained in accordance with it.


## Purpose / Big Picture


After this change, the Convex backend exposes the mutations and queries required for ingestion and safe reads. This allows the Python sync to upsert snapshots, insert and delete table rows in batches, log sync progress and errors, and read data without mixed builds. A user can verify this by running the Convex functions and seeing snapshots update, rows inserted, and logs recorded.


## Progress


- [x] (2025-12-22 17:05Z) Created this ExecPlan for Phase 8 Convex functions work.
- [x] (2025-12-22 17:22Z) Implemented snapshot queries/mutations in `convex/snapshots.ts`.
- [x] (2025-12-22 17:22Z) Implemented table data mutations and safe read queries in `convex/tableData.ts`.
- [x] (2025-12-22 17:22Z) Implemented sync log and error mutations in `convex/syncLogs.ts` and `convex/syncErrors.ts`.
- [x] (2025-12-22 17:22Z) Implemented asset record mutation in `convex/assets.ts`.
- [x] (2025-12-22 17:27Z) Validated by running `bunx convex dev` and confirming function push succeeds.


## Surprises & Discoveries


- None yet.


## Decision Log


- Decision: Require `DAMODARAN_SYNC_TOKEN` for all ingestion mutations and keep read-only queries public.
  Rationale: Matches Phase 8 guidance and protects mutation endpoints.
  Date/Author: 2025-12-22 (Codex)

- Decision: Add a `tableData:listBySnapshot` query that resolves `activeBuildId` before returning rows.
  Rationale: Enforces the “no mixed builds” invariant for reads.
  Date/Author: 2025-12-22 (Codex)


## Outcomes & Retrospective


Phase 8 functions are implemented and validated. Convex functions now support snapshot lifecycle management, safe table reads, batch row inserts/deletes, and operational logging.


## Context and Orientation


The Convex modules under `convex/` are currently placeholders (except `seed.ts`). Phase 8 requires concrete mutations and queries to support ingestion, logging, and safe reads. The schema already includes tables and indexes for snapshots, tableData, syncLogs, syncErrors, and assets. All ingestion mutations must verify the `DAMODARAN_SYNC_TOKEN` environment variable when present.


## Plan of Work


Replace `convex/snapshots.ts`, `convex/tableData.ts`, `convex/syncLogs.ts`, `convex/syncErrors.ts`, and `convex/assets.ts` with the required mutations and queries described in Launchpad Phase 8. Ensure `snapshots:upsertByIdentity` and `snapshots:finalizeRebuild` follow the active/pending build workflow and preserve `previousFileHashes`. Implement batch insert and delete in `tableData.ts` using indexed queries and sequential inserts, not `Promise.all`. Add a safe read query that uses `snapshots.activeBuildId`.


## Concrete Steps


From the repository root:

    Replace `convex/snapshots.ts` with `getByIdentity`, `upsertByIdentity`, and `finalizeRebuild`.

    Replace `convex/tableData.ts` with `insertBatch`, `deleteBySnapshotBuild`, and `listBySnapshot`.

    Replace `convex/syncLogs.ts` with `create`, `increment`, and `finish` mutations.

    Replace `convex/syncErrors.ts` with `append` mutation.

    Replace `convex/assets.ts` with `record` mutation.

    (Validation) Run:
      export PATH="$HOME/.bun/bin:$PATH"
      bunx convex dev
      bunx convex run seed:getReference


## Validation and Acceptance


The change is accepted when:

- `snapshots:upsertByIdentity` returns `created`, `unchanged`, or `updated` correctly and manages `activeBuildId`/`pendingBuildId`.
- `tableData:listBySnapshot` only returns rows from `activeBuildId`.
- `syncLogs` and `syncErrors` mutations insert and update data without errors.


## Idempotence and Recovery


Mutations are designed to be idempotent or safely repeatable: repeated `upsertByIdentity` calls with the same file hash return `unchanged`, and `deleteBySnapshotBuild` removes rows in bounded batches. Recovery for interrupted rebuilds is handled in the Python sync using `dataStatus` and `pendingBuildId`.


## Artifacts and Notes


No external artifacts are required beyond the updated Convex modules.


## Interfaces and Dependencies


`convex/snapshots.ts` should expose:

    getByIdentity
    upsertByIdentity
    finalizeRebuild

`convex/tableData.ts` should expose:

    insertBatch
    deleteBySnapshotBuild
    listBySnapshot

`convex/syncLogs.ts` should expose:

    create
    increment
    finish

`convex/syncErrors.ts` should expose:

    append

`convex/assets.ts` should expose:

    record


## Plan Change Notes


2025-12-22: Marked validation complete after running `bunx convex dev` successfully.
