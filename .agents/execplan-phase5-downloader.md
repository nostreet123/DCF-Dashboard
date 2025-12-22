# Phase 5: Downloader and cache


This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.


This plan follows `.agents/PLANS.md` and must be maintained in accordance with it.


## Purpose / Big Picture


After this change, the Python sync has a shared, rate-limited HTTP client and a downloader that caches raw files, retries transient failures, and computes a SHA-256 hash for each asset. This makes later ingestion stable and repeatable. A user can verify this by downloading a file twice and observing that the second run hits the cache and returns the same hash.


## Progress


- [x] (2025-12-22 16:05Z) Created this ExecPlan for Phase 5 downloader work.
- [x] (2025-12-22 16:17Z) Implemented shared HTTP client, rate limiting, and retry logic in `python/damodaran_sync/download.py`.
- [x] (2025-12-22 16:17Z) Implemented cache directory configuration in `python/damodaran_sync/config.py`.
- [x] (2025-12-22 16:17Z) Updated discovery to optionally use the shared HTTP client so rate limits are global across HTML + files.
- [x] (2025-12-22 16:17Z) Validated cache reuse and stable hash by downloading the same asset twice.


## Surprises & Discoveries


- None yet.


## Decision Log


- Decision: Use a single process-wide `RateLimiter` and `requests.Session` as the default HTTP client so discovery and downloads can share limits.
  Rationale: The plan requires a global rate limit across HTML and file downloads; sharing a single limiter enforces this.
  Date/Author: 2025-12-22 (Codex)


## Outcomes & Retrospective


The downloader now supports cached downloads with SHA-256 hashing, global rate limiting, and retry logic. Discovery can reuse the same HTTP client, keeping the rate limit global across HTML and file requests.


## Context and Orientation


`python/damodaran_sync/download.py` and `config.py` are placeholders. Phase 5 requires a downloader that caches raw files under `.cache/damodaran/raw/` (or an override from `DAMODARAN_CACHE_DIR`), computes SHA-256 hashes, and retries transient HTTP failures. The discovery module already fetches HTML pages; to satisfy the global rate limit requirement, discovery should optionally use the shared HTTP client from the downloader.


## Plan of Work


Implement a `RateLimiter` and `HttpClient` in `python/damodaran_sync/download.py` that enforce a minimum interval between requests, retry transient errors with exponential backoff, and expose a `download_file` function that caches files and returns metadata (path, hash, size, cache hit). Implement cache directory helpers in `python/damodaran_sync/config.py`. Update `python/damodaran_sync/discover.py` to accept an optional `HttpClient` and use it for HTML fetches, defaulting to the shared client.


## Concrete Steps


From the repository root:

    Replace `python/damodaran_sync/config.py` with cache path helpers.

    Replace `python/damodaran_sync/download.py` with:
      - `RateLimiter` enforcing a min interval.
      - `HttpClient` using `requests.Session`, retry + backoff, and rate limiting.
      - `download_file(url, ...)` that caches to `.cache/damodaran/raw/` and returns `DownloadResult`.

    Update `python/damodaran_sync/discover.py` to use the shared HTTP client when available.

    Validate by downloading a file twice and confirming cache reuse.


## Validation and Acceptance


The change is accepted when:

- A file download is cached under `.cache/damodaran/raw/` (or `DAMODARAN_CACHE_DIR` override).
- The second download returns `from_cache=True` and the same SHA-256 hash.
- Discovery can still fetch the current and archived pages using the shared HTTP client.


## Idempotence and Recovery


Downloads are safe to repeat: cached files are reused, and any partially downloaded `.part` files are overwritten on retry. The rate limiter is in-process only and resets on each run.


## Artifacts and Notes


No external artifacts are required; cache files are stored under `.cache/damodaran/raw/` and should remain gitignored.


## Interfaces and Dependencies


`download.py` should expose:

    class RateLimiter
    class HttpClient
    @dataclass DownloadResult
    def get_default_http_client() -> HttpClient
    def download_file(url: str, http_client: HttpClient | None = None, cache_dir: Path | None = None) -> DownloadResult

`config.py` should expose:

    def get_cache_dir() -> Path
    def get_raw_cache_dir() -> Path


## Plan Change Notes


2025-12-22: Marked implementation and validation complete after exercising the downloader cache and hash checks.
