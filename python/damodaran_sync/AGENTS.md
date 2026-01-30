# AGENTS.md - Damodaran Sync Engine

## Module Overview

The sync engine fetches financial datasets from Damodaran's website and syncs them to Convex.

**Pipeline**: Discovery → Download → Parse → Transform → Upload

```
discover.py → download.py → excel_parse.py → transform.py → convex_client.py
                                   ↓
                              sync.py (orchestration)
```

## File Inventory

| File | Purpose |
|------|---------|
| `sync.py` | Main orchestration - `process_page()` runs the full pipeline |
| `discover.py` | Discovers assets (Excel files) from Damodaran pages |
| `download.py` | HTTP client with Conditional GET, rate limiting, caching |
| `excel_parse.py` | Parses Excel files, selects correct sheet |
| `transform.py` | Normalizes data, generates `primaryKeyNorm` |
| `convex_client.py` | Typed wrapper around Convex mutations/queries |
| `mapping_resolver.py` | Maps file names → dataset keys & region codes |
| `dataset_mappings.py` | Pattern definitions for file → dataset resolution |
| `date_parser.py` | Extracts `asOfDate` from filenames and labels |
| `config.py` | Environment-based configuration |
| `cli.py` | Click CLI for running syncs |
| `mirror.py` | Fetches pre-built asset manifests |
| `__init__.py` | Package exports |

## Core Patterns

### 1. Build ID for Atomic Updates

See example in `sync.py:370-426`:
```bash
rg "build_id = uuid" sync.py -A 30
```

Pattern:
1. Generate unique `build_id = uuid.uuid4().hex`
2. `upsert_snapshot()` → creates with `pendingBuildId`, status `"rebuilding"`
3. `insert_rows()` → inserts tableData tagged with `build_id`
4. `finalize_snapshot()` → promotes to `activeBuildId`, status → `"ready"`
5. `delete_rows()` → cleans up old `buildId` rows

### 2. Conditional GET (HTTP 304)

See `download.py:110-194`:
```bash
rg "If-None-Match|If-Modified-Since" download.py -B 5 -A 10
```

Pattern:
- Store `sourceEtag` and `sourceLastModified` on snapshots
- On re-sync, send `If-None-Match` / `If-Modified-Since` headers
- If 304: skip download, return cached file
- Reduces bandwidth and avoids re-processing unchanged files

### 3. Thread-Safe Rate Limiting

See `download.py:30-46`:
```bash
rg "class RateLimiter" download.py -A 20
```

Pattern:
- Global `RateLimiter` with `threading.Lock`
- Shared across `HttpClient` instances
- Prevents overwhelming source server during parallel sync

### 4. Resilient Batch Insert

See `sync.py:189-207`:
```bash
rg "_insert_rows_resilient" sync.py -A 20
```

Pattern:
- If batch fails with "too large" error, split in half recursively
- Handles Convex 16MB function argument limit gracefully

## Key Examples

```bash
# Find the main sync entry point
rg "def process_page" sync.py -A 5

# Find ConvexSyncClient mutation wrappers
rg "def upsert_snapshot|def finalize_snapshot|def insert_rows" convex_client.py -A 3

# Find Conditional GET logic
rg "conditional_etag|conditional_last_modified" sync.py -B 2 -A 10

# Find dataset mapping patterns
rg "pattern.*datasetKey" mapping_resolver.py -A 2
```

## Anti-Patterns

| ❌ DON'T | ✅ DO |
|----------|-------|
| Use `sync_dataset_at_url()` | Use `process_page()` - the legacy function is deprecated |
| Use bare `print()` | Use `logger.info()` or `logger.error()` |
| Create new HTTP sessions per request | Use `get_default_http_client()` for shared rate limiter |
| Skip `from __future__ import annotations` | Always include at file top |

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `CONVEX_URL` | (required) | Convex deployment URL |
| `DAMODARAN_SYNC_TOKEN` | (required) | Auth token for mutations |
| `DAMODARAN_CONDITIONAL_GET` | `true` | Enable HTTP 304 support |
| `DAMODARAN_SYNC_WORKERS` | `1` | Parallel worker threads |
| `DAMODARAN_RATE_LIMIT_SECONDS` | `0.5` | Min seconds between requests |
| `DAMODARAN_SYNC_PROFILE` | `false` | Enable timing profiler |
| `DAMODARAN_TRUST_ARCHIVE_IMMUTABLE` | `false` | Skip re-syncing archive snapshots |
| `DAMODARAN_HEAD_PRECHECK` | `false` | Use HEAD precheck for conditional downloads |
| `DAMODARAN_ASSET_BATCH_SIZE` | `50` | Snapshot identity batch size for prefetch |

## CLI Commands

```bash
# Sync current data page
python -m damodaran_sync.cli sync-current

# Sync archive data page
python -m damodaran_sync.cli sync-all

# Force rebuild all (ignores cache/304)
python -m damodaran_sync.cli sync-current --force-rebuild

# Enable HEAD precheck for conditional downloads
python -m damodaran_sync.cli sync-current --head-precheck

# Seed reference data
python -m damodaran_sync.cli seed
```

## JIT Index Commands

```bash
# Find all mutation calls
rg "_mutation\(" convex_client.py

# Find all query calls
rg "_query\(" convex_client.py

# Find error handling
rg "except.*Exception|raise.*Error" sync.py

# Find dataclass definitions
rg "@dataclass" sync.py download.py transform.py

# Find timing instrumentation
rg "_maybe_time" sync.py
```

## Pre-PR Checks

```bash
# Run from python/ directory
cd python && pytest tests/test_convex_client.py tests/test_download_conditional.py tests/test_sync_performance.py tests/test_transform.py -v
```

Checklist:
- [ ] All sync-related tests pass
- [ ] No bare `print()` statements added
- [ ] `from __future__ import annotations` at top
- [ ] Type hints on all new functions
- [ ] Logging uses `logger.info/error/warning`
