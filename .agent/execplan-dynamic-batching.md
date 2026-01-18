# Dynamic, Size-Aware Batch Inserts For `tableData:insertBatch`

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository contains `.agent/PLANS.md` at the repo root. This document must be maintained in accordance with `.agent/PLANS.md`.

## Purpose / Big Picture

The Damodaran sync job uploads many `tableData` rows to Convex by calling the `tableData:insertBatch` mutation repeatedly. Previously the batch size was a fixed 100 rows per call, which was both (a) artificially low (it was a project guardrail, not a Convex hard limit), and (b) not adaptive to payload size.

After this change, the Python sync uses a dynamic batching algorithm that packs as many rows as possible into each call, subject to configurable caps on row count and estimated request size. On the Convex side, the mutation enforces a configurable maximum rows-per-call (defaulting to 100 for safety), clamped to a safe upper bound. This reduces the number of network roundtrips and gives operators a safe tuning knob when performance matters.

You can see it working by running a sync with larger configured batch limits (and a small sync limit so it finishes quickly) and observing fewer insert calls for the same number of rows.

## Progress

- [x] (2026-01-16) Implemented a dynamic, size-aware batching algorithm in `python/damodaran_sync/sync.py`.
- [x] (2026-01-16) Added automatic batch splitting on “batch too large” errors to make ingestion resilient if server/client limits are misaligned.
- [x] (2026-01-16) Made Convex `tableData:insertBatch` max rows configurable via `TABLEDATA_INSERT_MAX_ROWS`, default 100, clamped to 900.
- [x] (2026-01-16) Validated Python test suite passes (`python3 -m pytest -q python/tests`).

## Surprises & Discoveries

- Observation: The “100 rows max” limit was not a Convex limit; it was enforced by our own mutation guard in `convex/tableData.ts`.
  Evidence: `if (args.rows.length > 100) { throw new Error("Batch too large: max 100 rows per call"); }`

- Observation: Even if request sizes allow very large batches, Convex functions have a practical cap on per-function IO operations, so batching should keep headroom instead of aiming for the absolute maximum.
  Evidence: Convex limits include “Concurrent IO operations per function”, and this mutation performs one `ctx.db.insert` per row.

## Decision Log

- Decision: Keep default max rows at 100 (backwards compatible), but make it configurable and clamp to 900.
  Rationale: Avoid surprising runtime failures for existing deployments, while enabling a safe tuning path. The clamp preserves headroom for additional IO operations inside the mutation and reduces the risk of hitting per-function IO limits.
  Date/Author: 2026-01-16 / Codex

- Decision: Use estimated JSON payload size in Python to avoid building oversized request bodies.
  Rationale: The dynamic batching should adapt to “fat” rows (large `metrics`) without relying on a single fixed batch count.
  Date/Author: 2026-01-16 / Codex

- Decision: Add an error-driven fallback that splits batches and retries when the server reports “batch too large” or payload-too-large style failures.
  Rationale: This makes the system more robust when the Python client is configured more aggressively than the server, and provides a safety net for unexpectedly large rows.
  Date/Author: 2026-01-16 / Codex

## Outcomes & Retrospective

This change introduces a tunable, dynamic batching mechanism that can reduce the number of Convex mutation calls during large syncs. The defaults remain conservative to preserve stability. Future improvement would be to add structured per-stage timings for write vs. query vs. download on real sync runs and tune the default caps accordingly.

## Context and Orientation

Relevant components:

- `convex/tableData.ts` defines the Convex mutation `tableData:insertBatch`, which receives an array of rows and inserts them into the `tableData` table (one document per row).
- `python/damodaran_sync/sync.py` implements the end-to-end sync of Damodaran datasets: discovery → download → parse → transform → upsert snapshot → insert table rows in batches.

Terms:

- “Batch” means the array of rows passed in a single `tableData:insertBatch` mutation call.
- “Payload size” means the approximate serialized JSON bytes of the request arguments (rows plus wrapper JSON).

## Plan of Work

1. Update `convex/tableData.ts` so the maximum `rows.length` allowed is read from an environment variable (`TABLEDATA_INSERT_MAX_ROWS`), defaulting to 100 and clamped to 900, then enforce that maximum.
2. Update `python/damodaran_sync/sync.py` so the insert step constructs batches dynamically:
   - Cap by row count (`DAMODARAN_INSERT_BATCH_MAX_ROWS`, default 100, clamped to 900).
   - Cap by estimated JSON bytes (`DAMODARAN_INSERT_BATCH_MAX_BYTES`, default 8 MiB, clamped to 16 MiB).
   - Ensure at least one row per batch to avoid infinite loops.
   - If a batch insert fails with a “batch too large” style error, split the batch in half and retry recursively.
3. Validate via `pytest` and (optionally) a small real sync run with profiling enabled and a low asset limit.

## Concrete Steps

All commands below are run from the repo root: `/home/ec2-user/DCF-Dashboard`.

1. Run unit tests:

    python3 -m pytest -q python/tests

    Expected output (example):
      55 passed in <1s

2. (Optional) Deploy Convex function changes to a dev deployment (requires valid `CONVEX_DEPLOYMENT` and `CONVEX_DEPLOY_KEY` in env):

    ./node_modules/.bin/convex dev --once --typecheck disable --codegen disable

3. (Optional) Run a small sync with profiling on and a low asset limit to see stage timings, while tuning batching:

    DAMODARAN_SYNC_PROFILE=1 DAMODARAN_SYNC_LIMIT=5 DAMODARAN_INSERT_BATCH_MAX_ROWS=500 DAMODARAN_INSERT_BATCH_MAX_BYTES=8000000 \\
      PYTHONPATH=python python3 -m damodaran_sync.cli sync-current

    If `TABLEDATA_INSERT_MAX_ROWS` is still 100 in the Convex deployment, the server will reject larger batches; set the Convex env var (out of scope for this doc to automate).

## Validation and Acceptance

Acceptance is:

- Python test suite passes:

    python3 -m pytest -q python/tests

- When running a sync with larger batch limits enabled on both the Python side and Convex deployment side, the number of insert calls decreases (e.g., fewer batches for the same number of inserted rows), and the sync completes successfully.

## Idempotence and Recovery

These changes are safe to apply multiple times.

- If a deployment is not configured to accept larger batch sizes, leave defaults (100) unchanged and behavior remains as before.
- If a sync fails due to batch size, reduce `DAMODARAN_INSERT_BATCH_MAX_ROWS` and/or `DAMODARAN_INSERT_BATCH_MAX_BYTES` to retry safely.

## Artifacts and Notes

Key environment variables introduced/used by this plan:

- Convex (server-side): `TABLEDATA_INSERT_MAX_ROWS` (default 100; clamp to 900)
- Python (client-side):
  - `DAMODARAN_INSERT_BATCH_MAX_ROWS` (default 100; clamp to 900)
  - `DAMODARAN_INSERT_BATCH_MAX_BYTES` (default 8 MiB; clamp to 16 MiB)

## Interfaces and Dependencies

Convex function:

- `tableData:insertBatch` in `convex/tableData.ts` continues to accept:
  - `snapshotId`, `buildId`, `rows: Array<{ rowIndex, primaryKey, primaryKeyNorm, secondaryKey?, metrics }>`
  - and enforces `rows.length <= maxRows`, where `maxRows` is derived from `process.env.TABLEDATA_INSERT_MAX_ROWS`.

Python:

- `python/damodaran_sync/sync.py` uses a batching helper that yields `list[dict[str, Any]]` payloads suitable for `ConvexSyncClient.insert_rows(...)`.
