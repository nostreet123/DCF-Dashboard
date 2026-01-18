# User Story Spec: Conditional GET fast sync for Damodaran ingest

## Story

As a data operations user,
I want sync-current and sync-all to complete much faster when source files are unchanged,
so that I can re-run syncs frequently without waiting while keeping data correctness identical.

## Background / Context

The current sync pipeline downloads every file, parses it, transforms it, and uploads rows to Convex. Even when files are unchanged, the download+parse+upload work still happens. The source server supports HTTP conditional GET via ETag and Last-Modified headers. A 304 Not Modified response is a server-confirmed signal that the file content is unchanged and safe to skip.

## Requirements (Given/When/Then)

### Scenario 1: First sync of a file

Given a file has no recorded validators (ETag/Last-Modified) in Convex,
When sync runs,
Then the file is downloaded and processed normally,
And the snapshot metadata stores any ETag/Last-Modified returned by the server.

### Scenario 2: File unchanged (server confirms)

Given a file has a snapshot with status "ready" and stored validators,
When sync runs with conditional GET enabled,
And the server responds 304 Not Modified,
Then the pipeline skips parse and upload for that file,
And the asset is counted as skipped,
And no data changes occur in Convex.

### Scenario 3: File unchanged but local cache missing

Given the server responds 304 Not Modified,
And the cached file does not exist locally,
When sync runs,
Then the downloader retries once without conditional headers,
And the file is downloaded and processed normally.

### Scenario 4: Force rebuild

Given sync runs with force rebuild enabled,
When conditional GET is enabled,
Then the pipeline does not short-circuit on 304,
And the file is downloaded and processed normally.

## Acceptance Criteria

- Running sync-current twice in a row with conditional GET enabled results in the second run being materially faster and with many assetsSkipped.
- Data correctness is unchanged; no updates occur when the source files are unchanged.
- All tests pass: `python3 -m pytest -q python/tests`.

## Non-goals

- No new external infrastructure or queues.
- No schema backfills or migrations beyond optional fields.

## Implementation Notes (for engineers)

- Store optional `sourceEtag` and `sourceLastModified` in snapshot metadata.
- Use `If-None-Match` / `If-Modified-Since` on HTTP requests when validators are available.
- Treat HTTP 304 as safe skip only when snapshot is ready.
- Add a toggle `DAMODARAN_CONDITIONAL_GET=1` to enable conditional GET.

