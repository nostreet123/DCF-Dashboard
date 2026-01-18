# Add Conditional GET to Damodaran Sync

This ExecPlan is a living document. The sections Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective must be kept up to date as work proceeds.

This plan must be maintained in accordance with /home/ec2-user/DCF-Dashboard/.agent/PLANS.md.

## Purpose / Big Picture

We want sync-current and sync-all to become dramatically faster without skipping correctness. After this change, a sync run will issue conditional HTTP requests using ETag and Last-Modified so unchanged files return HTTP 304 and are skipped safely. A user can run the sync twice back-to-back and observe the second run complete much faster while still reporting the same data in Convex.

## Progress

- [x] (2026-01-16 00:00Z) Implement conditional GET download logic with ETag/Last-Modified and safe 304 handling.
- [x] (2026-01-16 00:00Z) Persist source validators (ETag/Last-Modified) in snapshots and expose them to sync.
- [x] (2026-01-16 00:00Z) Update sync pipeline to short-circuit on 304 when snapshot is ready and validators match.
- [x] (2026-01-16 00:00Z) Update tests, docs, and environment examples; validate with a real sync.

## Surprises & Discoveries

- (2026-01-16) Verified Damodaran server returns both ETag and Last-Modified headers (e.g. ETag: "12e00-6483108fad634", Last-Modified: Mon, 12 Jan 2026 13:41:41 GMT).

## Decision Log

- Decision: Use HTTP conditional GET (ETag/Last-Modified) as the safe “skip” mechanism instead of heuristic caching.
  Rationale: 304 Not Modified is a server-confirmed guarantee that the content has not changed, which preserves correctness while reducing work.
  Date/Author: 2026-01-16 / Codex

- Decision: Conditional GET is opt-out (enabled by default).
  Rationale: Immediate performance benefit; users can disable with DAMODARAN_CONDITIONAL_GET=0 if issues arise.
  Date/Author: 2026-01-16 / User

- Decision: Retry logic for 304+missing cache lives inside download_file().
  Rationale: Encapsulates recovery logic, keeps sync.py cleaner.
  Date/Author: 2026-01-16 / User

## Outcomes & Retrospective

Implementation complete with schema updates, conditional download logic, sync short-circuiting, and unit tests. `python3 -m pytest -q python/tests` passed locally.

## Context and Orientation

The current sync pipeline lives in python/damodaran_sync/sync.py and performs these steps for each asset: download (python/damodaran_sync/download.py), parse (python/damodaran_sync/excel_parse.py), transform (python/damodaran_sync/transform.py), then upsert snapshots and insert rows in Convex (convex/snapshots.ts, convex/tableData.ts). Sync can skip work only after downloading a file and hashing it. The Convex snapshots table is defined in convex/schema.ts and the validation of snapshot metadata is in convex/snapshots.ts (SnapshotMetadata). Sync already records fileHash and dataStatus for each snapshot.

A conditional GET is an HTTP request that includes If-None-Match (ETag) and/or If-Modified-Since (Last-Modified). When the server confirms the file is unchanged, it replies with HTTP 304 and no body. This is safe to skip parsing and uploads only if we already have a “ready” snapshot for that file.

## Plan of Work

First, extend the Convex snapshot schema and metadata to store two optional values: sourceEtag and sourceLastModified. These will be recorded when a download returns headers so future runs can use them as validators. Update the SnapshotMetadata validator in convex/snapshots.ts and the snapshots table definition in convex/schema.ts. Update getByIdentityBatch in convex/snapshots.ts to return these fields so the Python sync can use them without extra round trips.

Next, update python/damodaran_sync/download.py to support conditional GET. Expand DownloadResult to include optional fields for etag, last_modified, and not_modified (boolean). Add optional parameters to download_file (etag, last_modified, allow_not_modified) and include If-None-Match/If-Modified-Since headers on the request when provided. If the response is 304 and the cached file exists, compute the hash/size from the cached file and return DownloadResult with not_modified=True; if the file is missing, retry once without conditional headers (allow_not_modified=False) so parsing can proceed. Preserve current behavior when validators are absent or the server replies 200, and capture ETag/Last-Modified from response headers on success.

Then update python/damodaran_sync/sync.py. Add a toggle for DAMODARAN_CONDITIONAL_GET (default enabled, disable with 0). When enabled and a snapshot is ready and has sourceEtag and/or sourceLastModified, pass those into download.download_file. If download returns not_modified=True and the snapshot exists with dataStatus "ready" and activeBuildId set, skip parsing and upload, increment assetsSkipped, and continue. When a download returns 200, capture response headers into the metadata (sourceEtag/sourceLastModified) so they persist in Convex. Continue storing fileHash as before. Ensure force_rebuild overrides this short-circuit.

Finally, update tests and docs. Add unit tests in python/tests that mock HTTP responses to validate conditional GET handling: 304 with cached file, 304 without cached file (forces retry), and 200 with headers. Update any performance tests that assume the Downloader interface. Add the new environment variable to .env.example to control conditional GET (for example DAMODARAN_CONDITIONAL_GET=1) and document how to disable it for debugging.

## Concrete Steps

Work in /home/ec2-user/DCF-Dashboard.

1) Update Convex schema and metadata.

   - Edit convex/schema.ts to add optional fields sourceEtag and sourceLastModified to snapshots.
   - Edit convex/snapshots.ts SnapshotMetadata to accept these fields.
   - Update convex/snapshots.ts getByIdentityBatch to return them in the result object:
     - sourceEtag: snapshot.sourceEtag
     - sourceLastModified: snapshot.sourceLastModified

2) Implement conditional GET in the downloader.

   - Edit python/damodaran_sync/download.py:
     - Add fields to DownloadResult: etag, last_modified, not_modified.
     - Update download_file signature to accept etag, last_modified, allow_not_modified.
     - Add If-None-Match/If-Modified-Since headers when validators are provided.
     - Treat 304 responses as not_modified without raising for status.
     - If cached file exists, compute sha256/size and return not_modified=True with cached path.
     - If cached file is missing, retry once without validators (allow_not_modified=False).
     - Capture ETag/Last-Modified response headers on 200 responses.

3) Wire conditional GET into sync.

   - Edit python/damodaran_sync/sync.py to add DAMODARAN_CONDITIONAL_GET toggle (default enabled, disable with 0).
   - When enabled and a ready snapshot has validators, pass them into download_file.
   - Short-circuit when not_modified and snapshot is ready with activeBuildId set.
   - Store sourceEtag/sourceLastModified into metadata when present.
   - Ensure force_rebuild bypasses conditional GET behavior.

4) Tests and docs.

   - Add a new test module (for example python/tests/test_download_conditional.py) that mocks requests.Session.get to return 304 and 200 with headers.
   - Update any tests using Downloader to align with the new DownloadResult fields.
   - Update .env.example with the new toggle (enabled by default, set to 0 to disable).

## Validation and Acceptance

Run the following from /home/ec2-user/DCF-Dashboard/python:

  - python3 -m pytest -q python/tests

Expected: all tests pass, including new conditional GET tests.

Then run two sync-current passes (conditional GET enabled by default; set DAMODARAN_CONDITIONAL_GET=0 to disable):

  - DAMODARAN_SYNC_PROFILE=1 python3 -m damodaran_sync.cli sync-current --force-rebuild
  - DAMODARAN_SYNC_PROFILE=1 python3 -m damodaran_sync.cli sync-current

Acceptance: the second run reports many assets skipped due to not_modified, and the total wall-clock time is significantly reduced compared to the first run while leaving snapshot dataStatus as "ready" for all assets.

## Idempotence and Recovery

The changes are additive and safe to rerun. If conditional GET causes an unexpected skip, set DAMODARAN_CONDITIONAL_GET=0 to force full downloads. If a cached file is missing and a 304 is received, the downloader must retry without validators to recover. All schema changes are optional fields and do not require data backfills.

## Artifacts and Notes

Keep a short timing summary from the second sync run in the PR notes or terminal log to demonstrate improvement, for example:

  Timing summary:
  - download: 2.10s (4.3%)
  - parse_excel: 0.12s (0.2%)
  - insert_rows_total: 3.40s (7.0%)

## Interfaces and Dependencies

In python/damodaran_sync/download.py, define DownloadResult to include:

  - url: str
  - path: Path
  - sha256: str
  - size_bytes: int
  - from_cache: bool
  - etag: Optional[str]
  - last_modified: Optional[str]
  - not_modified: bool

Update download_file signature to:

  def download_file(
      url: str,
      http_client: HttpClient | None = None,
      cache_dir: Path | None = None,
      *,
      etag: str | None = None,
      last_modified: str | None = None,
      allow_not_modified: bool = True,
  ) -> DownloadResult:

In convex/schema.ts, snapshots table must include optional sourceEtag and sourceLastModified fields. In convex/snapshots.ts, SnapshotMetadata must include matching optional fields so metadata can be stored and later retrieved by getByIdentityBatch.

---

Change log:
- Initial plan created (2026-01-16 / Codex).
- Updated plan with header verification, opt-out toggle, and retry clarifications (2026-01-16 / Codex).
