# User Story Spec: Thread-safe HTTP clients for multi-worker sync

## Story

As a data operations user,
I want multi-worker Damodaran syncs to be reliable under concurrency,
so that enabling `DAMODARAN_SYNC_WORKERS` does not introduce intermittent HTTP failures.

## Background / Context

The sync pipeline downloads files through `download.download_file()`. That function uses a process-wide singleton `HttpClient`, which wraps a `requests.Session`. `requests.Session` is not thread-safe, and in multi-worker mode the same session is shared across threads. This can cause intermittent failures or corrupted responses under load.

## Requirements (Given/When/Then)

### Scenario 1: Default download in multi-worker mode

Given `DAMODARAN_SYNC_WORKERS > 1`,
When `download.download_file()` is called without an explicit `http_client`,
Then each worker thread uses its own `requests.Session` (no shared session across threads),
And downloads remain correct and reliable under concurrency.

### Scenario 2: Default download in single-worker mode

Given `DAMODARAN_SYNC_WORKERS <= 1`,
When `download.download_file()` is called without an explicit `http_client`,
Then behavior remains unchanged aside from thread-local allocation,
And download semantics/caching are unchanged.

### Scenario 3: Custom HTTP client injection

Given `download.download_file()` is called with an explicit `HttpClient`,
When sync runs (any worker count),
Then the provided client is used as-is,
And no automatic thread-local client is created or substituted.

### Scenario 4: Rate limiting remains globally enforced

Given a rate limit is configured,
When multiple worker threads download concurrently,
Then overall rate limiting behavior remains consistent with the current intent
(avoid increasing request rate just because multiple threads exist).

## Acceptance Criteria

- Multi-worker sync completes without intermittent HTTP session errors.
- Default downloads in multi-worker mode do not share a `requests.Session` across threads.
- Providing an explicit `HttpClient` preserves existing injection/mocking behavior.
- Unit tests (or lightweight verification) confirm distinct clients per thread.

## Non-goals

- No changes to download logic, caching, or conditional GET behavior.
- No change to the sync pipeline outside of HTTP client creation.

## Implementation Notes (for engineers)

- Replace the global `_DEFAULT_HTTP_CLIENT` with thread-local storage (e.g., `threading.local()`), so each thread gets its own `HttpClient`/`requests.Session`.
- To preserve global rate limiting, create a module-level shared `RateLimiter` instance and pass it into each thread-local `HttpClient` (so sessions are distinct, but throttling is shared).
- Keep `download.download_file()` signature unchanged; it should continue to accept an optional `http_client` and only use the default when one is not provided.
- Add a small test or diagnostic helper to assert that `get_default_http_client()` returns distinct instances across threads while sharing the same rate limiter (if exposed), or otherwise assert different `session` object identities.
