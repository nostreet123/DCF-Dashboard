# Mirror-Based Fast Sync (Sub‑Minute When Unchanged)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository contains `.agent/PLANS.md` at the repo root. This document must be maintained in accordance with `.agent/PLANS.md`.

## Purpose / Big Picture

Full `sync-all` and `sync-current` runs are slow because they scrape pages, download many files, and issue thousands of Convex calls. To support “sub‑minute” syncs in the common case where nothing has changed, we add a mirror manifest fast-path and bulk snapshot lookup. The manifest lets us detect a no‑change run in one HTTP request and exit early. The bulk snapshot lookup reduces Convex roundtrips when changes do exist.

After this change, operators can point the sync to a mirror manifest (`DAMODARAN_MIRROR_MANIFEST_URL`). If the manifest hash is unchanged and `DAMODARAN_FAST_EXIT_IF_MANIFEST_UNCHANGED=1`, the sync finishes in under a minute by creating a log and exiting without downloads. When changes do exist, the sync still proceeds with the full ingestion but with fewer Convex calls.

## Progress

- [x] (2026-01-16) Added `syncManifests` table and `syncManifests:getLatest` / `syncManifests:upsert` functions in Convex.
- [x] (2026-01-16) Added `snapshots:getByIdentityBatch` query to reduce per‑asset snapshot lookups.
- [x] (2026-01-16) Added mirror manifest loader in `python/damodaran_sync/mirror.py`.
- [x] (2026-01-16) Updated `python/damodaran_sync/sync.py` to use mirror manifest fast‑path, bulk snapshot lookup, and manifest tracking.
- [x] (2026-01-16) Added optional worker pool to parallelize per‑asset ingestion (`DAMODARAN_SYNC_WORKERS`).
- [x] (2026-01-16) Regenerated Convex codegen via `convex dev --once`.
- [x] (2026-01-16) Verified Python tests (`python3 -m pytest -q python/tests`).

## Surprises & Discoveries

- Observation: `sync-all` spends a lot of time on per‑asset Convex snapshot queries. A bulk query with chunking avoids thousands of roundtrips and keeps the query within Convex IO limits.
  Evidence: Prior profiling showed `get_snapshot_by_identity` dominating runtime on cache‑hit runs.

## Decision Log

- Decision: Implement a mirror manifest fast‑exit path controlled by `DAMODARAN_FAST_EXIT_IF_MANIFEST_UNCHANGED`.
  Rationale: This achieves sub‑minute runs when nothing changes, without breaking existing behavior for normal runs.
  Date/Author: 2026-01-16 / Codex

- Decision: Add a `syncManifests` table to track the last manifest hash per page type.
  Rationale: We need a server‑side reference to detect manifest changes reliably across runs and hosts.
  Date/Author: 2026-01-16 / Codex

- Decision: Implement `snapshots:getByIdentityBatch` and use chunking client‑side.
  Rationale: It reduces roundtrips and keeps per‑query IO under Convex limits.
  Date/Author: 2026-01-16 / Codex

## Outcomes & Retrospective

This change enables sub‑minute syncs when the mirror manifest is unchanged, and reduces overhead even when ingestion is required. The remaining gap to “always under one minute” is the time needed to download, parse, and insert when there are real changes; that work still scales with the number of changed assets.

## Context and Orientation

Relevant files:

- `convex/schema.ts`: Data model. We add the `syncManifests` table.
- `convex/syncManifests.ts`: New query/mutation to track last manifest hashes.
- `convex/snapshots.ts`: Add `getByIdentityBatch`.
- `python/damodaran_sync/mirror.py`: Fetches and parses the mirror manifest and maps assets to `DiscoveredAsset`.
- `python/damodaran_sync/sync.py`: Uses mirror manifest, bulk snapshot lookup, and tracks manifest hashes.

## Plan of Work

1. Add `syncManifests` to the Convex schema and create new `getLatest` + `upsert` functions to store and compare manifest hashes.
2. Add `snapshots:getByIdentityBatch` to reduce per‑asset snapshot lookups.
3. Implement mirror manifest parsing in Python and integrate it into `process_page`.
4. Add a fast‑exit path when the manifest hash is unchanged.
5. Add bulk snapshot lookup with chunking.
6. Regenerate Convex codegen and validate with tests.

## Concrete Steps

All commands below are run from the repo root: `/home/ec2-user/DCF-Dashboard`.

1. Generate Convex code after schema/function changes:

    ./node_modules/.bin/convex dev --once --typecheck disable

2. Run Python tests:

    python3 -m pytest -q python/tests

3. Example run using mirror fast‑exit:

    DAMODARAN_MIRROR_MANIFEST_URL=https://your-mirror/manifest.json \\
    DAMODARAN_FAST_EXIT_IF_MANIFEST_UNCHANGED=1 \\
    PYTHONPATH=python python3 -m damodaran_sync.cli sync-all

    Expected: if manifest hash is unchanged, the sync finishes quickly and logs a success with assets skipped.

## Validation and Acceptance

Acceptance is:

- Sync logs show a successful run that exits quickly when the manifest hash matches the previous hash.
- `python3 -m pytest -q python/tests` passes.

## Idempotence and Recovery

These changes are safe to apply multiple times. If the mirror manifest is misconfigured, unset `DAMODARAN_MIRROR_MANIFEST_URL` and the sync falls back to live discovery.

If a fast‑exit run was incorrect, disable `DAMODARAN_FAST_EXIT_IF_MANIFEST_UNCHANGED` and rerun a full sync.

## Artifacts and Notes

Environment variables introduced/used:

- `DAMODARAN_MIRROR_MANIFEST_URL`: URL to the mirror JSON manifest.
- `DAMODARAN_FAST_EXIT_IF_MANIFEST_UNCHANGED`: enable fast exit when manifest hash unchanged.
- `DAMODARAN_SNAPSHOT_BATCH_SIZE`: batch size for bulk snapshot lookup (default 500).
- `DAMODARAN_SYNC_WORKERS`: number of parallel worker threads for per‑asset ingestion (default 1).

Manifest format (JSON, simplified):

    {
      "pageType": "archive",
      "assets": [
        {
          "pageType": "archive",
          "sourceUrl": "https://pages.stern.nyu.edu/.../file.xls",
          "downloadUrl": "https://mirror.example.com/file.xls",
          "fileName": "file.xls",
          "linkLabel": "US",
          "pageLastUpdated": "2026-01-09",
          "asOfDate": "2026-01-01",
          "asOfDateSource": "label",
          "asOfGranularity": "day",
          "fileHash": "sha256..."
        }
      ]
    }

## Interfaces and Dependencies

Convex:

- `syncManifests:getLatest(syncToken, pageType)` returns the latest manifest record.
- `syncManifests:upsert(syncToken, pageType, manifestHash, source, itemCount)` stores/refreshes the manifest hash.
- `snapshots:getByIdentityBatch(identities)` returns lightweight snapshot records for a list of identities.

Python:

- `mirror.fetch_manifest(url, page_type)` returns a `MirrorManifest` with `assets` and `manifest_hash`.
- `process_page` uses the mirror manifest if configured and may fast‑exit if unchanged.
