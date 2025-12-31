# Damodaran Financial Database (Convex) - Complete Implementation Plan (Empty Repo)

Last updated: 2025-12-18

## Purpose

Build a small standalone repository that stores Professor Aswath Damodaran's public datasets in Convex and keeps them updated via a Python sync job.

After implementing this plan, a new repo should be able to:
- Seed reference data (categories/regions/datasets/mappings).
- Backfill all archived datasets once.
- Run a weekly sync against the "current data" page (idempotent).
- Query snapshots and rows from Convex.

This plan is intended to be executed in an empty repository. If integrating into an existing monorepo, adjust paths and tooling accordingly.

## Scope / non-goals

In scope:
- Discover all Excel assets linked from:
  - `https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datacurrent.html`
  - `https://pages.stern.nyu.edu/~adamodar/New_Home_Page/dataarchived.html`
- Parse `asOfDate` from the HTML link label when present; otherwise from page-level "last full update" metadata.
- Store a generic representation that works across many table shapes (industry/country/time series/misc).
- Maintain operational logs in Convex (`syncLogs`).

Out of scope (for v1):
- Authentication/authorization for read access.
- Perfect per-dataset parsing for every file on day one (use robust heuristics; add dataset profiles over time).
- Storing raw Excel binaries in Convex (store parsed tables + source metadata; keep raw files in a local cache).

## Key invariants (do not violate)

- Snapshot identity = `(datasetKey, regionCode, asOfDate)` (all lowercase; `asOfDate` is `YYYY-MM-DD`).
- `asOfDate` = (link-label date if parseable) else (page-level "last full update" date if present) else:
  - for `pageType="archive"` only: optionally infer from filename when the filename deterministically encodes a period (record `asOfDateSource="filename_inferred"`), else skip/unparsable.
  - for `pageType="current"`: skip/unparsable.
- `fileHash` is used for change detection, not snapshot identity.
- Table storage is generic rows in `tableData`:
  - `primaryKey` / `secondaryKey` = the "dimensions" (often first 1-2 columns)
  - `metrics` = JSON object for all other columns
- Idempotence rules:
  - If snapshot exists and `fileHash` matches: skip.
  - If snapshot exists and `fileHash` differs: delete rows for that snapshot, replace rows, update snapshot metadata (and append prior hash to `previousFileHashes`).
  - If snapshot does not exist: insert snapshot + rows.
- Never use "today()" as a synthetic date. If date cannot be determined deterministically, ingest nothing and record the unresolved asset.

## Review findings (address in plan)

- Reads must always use `snapshots.activeBuildId` to avoid mixed builds; no consumer should query `tableData` without resolving the active build first.
- Define a deterministic recovery path for interrupted rebuilds (`dataStatus="rebuilding"` with `pendingBuildId`).
- Externalization must consider per-row size limits for very wide tables, not just total row count / total bytes.
- Explicitly document that only `.xls`/`.xlsx` assets are in scope (ignore `.xlsm`/`.csv`/`.zip` unless later expanded).
- Log/record unparsable or ambiguous date labels (do not silently coerce).
- Prefer enum-style validation for fields like `dataType`, `pageType`, `storageType`, `asOfGranularity` to avoid drift.

---

# Phase 1: Repo scaffold (empty repo)

## 1.1 Create base folders (for sortability)

Create the top-level folders up front so the repo tree stays predictable and sorted:

```bash
mkdir -p .github/workflows convex python/damodaran_sync python/tests
```

If you want the folders to appear in the repo before files are added, drop a temporary
`.keep` file in each directory and remove them as you add real files.

## 1.2 Directory structure

```
.
|-- convex/
|   |-- assets.ts
|   |-- schema.ts
|   |-- seed.ts
|   |-- snapshots.ts
|   |-- tableData.ts
|   |-- syncErrors.ts
|   `-- syncLogs.ts
|-- python/
|   |-- requirements.txt
|   |-- damodaran_sync/
|   |   |-- __init__.py
|   |   |-- config.py
|   |   |-- dataset_mappings.py
|   |   |-- date_parser.py
|   |   |-- discover.py
|   |   |-- download.py
|   |   |-- excel_parse.py
|   |   |-- transform.py
|   |   |-- convex_client.py
|   |   `-- cli.py
|   `-- tests/
|       |-- test_date_parser.py
|       `-- test_dataset_mappings.py
|-- .github/
|   `-- workflows/
|       |-- ci.yml
|       |-- codespell.yml
|       `-- damodaran-weekly-sync.yml
|-- .gitignore
|-- package.json
`-- README.md
```

## 1.3 Convex initialization

From repo root (using bun):

```bash
bun init -y
bun add convex
bunx convex dev
```

Notes:
- `npx convex dev` will create `convex.json` and generate `convex/_generated/`.
- Capture the deployment URL printed by the CLI and store it as `CONVEX_URL` (for Python) and, if you later add a web client, `VITE_CONVEX_URL`.
- Do not commit secrets. Store any tokens as Convex env vars and GitHub secrets.
- For a small repo like this, it is usually simplest to commit `convex.json` and `convex/_generated/` so fresh clones can run without first generating code.

Production deployment (needed for GitHub Actions):
- After you have implemented the Convex functions in `convex/`, deploy them to a hosted Convex deployment with:
  - `bunx convex deploy`
- Set `DAMODARAN_SYNC_TOKEN` as an environment variable in that deployment (via the Convex dashboard or `npx convex env set`).
- Use that hosted deployment URL as the GitHub Actions secret `CONVEX_URL`.

## 1.4 Python setup

From repo root:

```bash
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r python/requirements.txt
```

Important:
- Because the Python package is under `python/damodaran_sync/`, run CLI commands and tests from the `python/` directory:
  - `cd python`
  - then `python -m damodaran_sync.cli ...` and `pytest ...`

`python/requirements.txt` (starter set):

```
convex>=0.6.0
python-dotenv>=1.0.0
requests>=2.31.0
beautifulsoup4>=4.12.0
lxml>=4.9.0
tenacity>=8.2.0
tqdm>=4.66.0
pandas>=2.0.0
openpyxl>=3.1.0
xlrd>=2.0.0
pytest>=7.0.0
```

## 1.5 .gitignore (minimum)

Add a `.gitignore` that covers at least:
- `.venv/`
- `__pycache__/`
- `.cache/` (or whatever cache dir you choose)
- `.env` / `.env.*` (keep tokens out of git)
- `python/.pytest_cache/`

---

# Phase 2: Convex data model (single consistent model)

## 2.1 Schema

Create `convex/schema.ts` with these tables:
- `categories`, `regions`, `datasets`, `datasetMappings` (reference data)
- `snapshots` (one per datasetKey/regionCode/asOfDate)
- `tableData` (generic rows for each snapshot)
- `syncLogs`, `syncErrors` (operational logging)
- Optional: `assets` (records every discovered link and its resolution outcome; makes coverage auditing trivial)

```ts
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // -----------------------------
  // Reference tables
  // -----------------------------
  categories: defineTable({
    slug: v.string(),
    name: v.string(),
    description: v.string(),
    sortOrder: v.number(),
  }).index("by_slug", ["slug"]),

  regions: defineTable({
    code: v.string(), // lowercase canonical: "us", "europe", ...
    name: v.string(),
    fileTokens: v.array(v.string()), // tokens appearing in filenames (lowercase)
    sortOrder: v.number(),
  }).index("by_code", ["code"]),

  datasets: defineTable({
    key: v.string(), // lowercase canonical: "wacc", "beta", ...
    name: v.string(),
    description: v.string(),
    categorySlug: v.string(),
    dataType: v.string(), // "industry" | "country" | "timeseries" | "other"
    // Used when neither the link label nor filename contains region info.
    // Examples: "us" for most single-file datasets; "global" for country risk premium tables.
    defaultRegionCode: v.string(), // "us" | "europe" | "japan" | "ausnzcan" | "emerging" | "china" | "india" | "global" | "unknown"
  })
    .index("by_key", ["key"])
    .index("by_category", ["categorySlug"]),

  datasetMappings: defineTable({
    pattern: v.string(), // exact match or regex
    datasetKey: v.string(), // references datasets.key
    isRegex: v.boolean(),
  })
    // upsert identity: (pattern, datasetKey, isRegex)
    .index("by_identity", ["pattern", "datasetKey", "isRegex"])
    .index("by_datasetKey", ["datasetKey"]),

  // -----------------------------
  // Snapshot + data
  // -----------------------------
  snapshots: defineTable({
    datasetKey: v.string(),
    regionCode: v.string(),
    asOfDate: v.string(), // "YYYY-MM-DD"
    asOfDateSource: v.string(), // "label" | "page_last_update" | "filename_inferred"
    asOfGranularity: v.string(), // "day" | "month"

    // Traceability
    sourcePageUrl: v.string(), // which HTML page the link came from (current vs archive)
    sourceUrl: v.string(),
    fileName: v.string(),
    linkLabel: v.string(),
    pageType: v.string(), // "current" | "archive"
    pageLastUpdated: v.optional(v.string()),

    fileHash: v.string(),
    previousFileHashes: v.optional(v.array(v.string())),

    // Non-atomic replace mitigation: write rows under a new buildId, then flip activeBuildId.
    dataStatus: v.string(), // "ready" | "rebuilding"
    activeBuildId: v.string(),
    pendingBuildId: v.optional(v.string()),

    // Storage policy for large datasets.
    storageType: v.string(), // "convex" | "external"
    externalProvider: v.optional(v.string()), // "s3" | "r2" | ...
    externalUrl: v.optional(v.string()),
    externalRowCount: v.optional(v.number()),
    externalByteSize: v.optional(v.number()),
    sampleStrategy: v.optional(v.string()), // "head" | "head+tail" | "random_seeded_42" | ...
    sampleRowCount: v.optional(v.number()),

    sheetName: v.string(),
    headerRow: v.number(),
    columnNames: v.array(v.string()),
    metricsKeys: v.array(v.string()), // unique metric keys (for introspection)
    rowCount: v.number(),
    dataType: v.string(),

    // Evidence for multi-sheet workbooks (v1 parses a single sheet, but keeps context)
    sheetCandidates: v.array(v.string()),
    skippedSheets: v.array(v.string()),

    downloadedAt: v.number(),
    parsedAt: v.number(),
  })
    .index("by_identity", ["datasetKey", "regionCode", "asOfDate"])
    .index("by_dataset_region", ["datasetKey", "regionCode"])
    .index("by_asOfDate", ["asOfDate"]),

  // For storageType="external", tableData holds only the sampled/aggregated view.
  tableData: defineTable({
    snapshotId: v.id("snapshots"),
    buildId: v.string(),
    rowIndex: v.number(),
    primaryKey: v.string(),
    secondaryKey: v.optional(v.string()),
    metrics: v.any(),
  })
    .index("by_snapshot_build_rowIndex", ["snapshotId", "buildId", "rowIndex"])
    .index("by_snapshot_build_primaryKey", ["snapshotId", "buildId", "primaryKey"]),

  // -----------------------------
  // Operational logs
  // -----------------------------
  syncLogs: defineTable({
    syncType: v.string(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    status: v.string(), // "running" | "success" | "partial" | "failed"

    assetsDiscovered: v.number(),
    assetsDownloaded: v.number(),
    assetsSkipped: v.number(),
    rowsInserted: v.number(),
    errorCount: v.number(),

    pageLastUpdated: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_startedAt", ["startedAt"]),

  // Unbounded per-run errors must not live inside syncLogs (doc size limits).
  syncErrors: defineTable({
    syncLogId: v.id("syncLogs"),
    file: v.string(),
    error: v.string(),
    timestamp: v.number(),
    stage: v.string(), // "discover" | "download" | "parse" | "transform" | "upload"
  })
    .index("by_syncLogId_timestamp", ["syncLogId", "timestamp"]),

  assets: defineTable({
    sourcePageUrl: v.string(),
    pageType: v.string(), // "current" | "archive"
    pageLastUpdated: v.optional(v.string()),

    sourceUrl: v.string(),
    fileName: v.string(),
    linkLabel: v.string(),

    resolved: v.boolean(),
    resolvedDatasetKey: v.optional(v.string()),
    resolvedRegionCode: v.optional(v.string()),
    resolvedAsOfDate: v.optional(v.string()),
    resolvedAsOfDateSource: v.optional(v.string()),
    resolutionError: v.optional(v.string()),

    discoveredAt: v.number(),
  })
    .index("by_pageType_discoveredAt", ["pageType", "discoveredAt"])
    .index("by_resolved_discoveredAt", ["resolved", "discoveredAt"]),
});
```

---

# Phase 3: Seed reference data

Create `convex/seed.ts` with mutations to upsert:
- categories (9 core, plus an `unknown` category for unmapped datasets)
- regions (8, lowercase canonical, plus `unknown` for unresolved cases)
- datasets (starter catalog; include `defaultRegionCode` for each dataset)
- datasetMappings (pattern -> datasetKey)

Upsert strategy:
- categories: upsert by `slug`
- regions: upsert by `code`
- datasets: upsert by `key`
- mappings: upsert by `(pattern, datasetKey, isRegex)`

Seed rule:
- For any dataset whose link labels are often "Download" (not a region), set `defaultRegionCode="us"`.
- For `ctryprem`, set `defaultRegionCode="global"` (even though the file name itself is not region-specific).
- If a dataset is discovered that is not present in `datasets`, auto-create it with:
  - `categorySlug="unknown"`, `dataType="other"`, `defaultRegionCode="unknown"`, and a placeholder `name/description`.

---

# Phase 4: Asset discovery (Python)

## 4.1 Pages to scan

- Current page: `datacurrent.html`
- Archive page: `dataarchived.html`

Extract all links to `.xls` and `.xlsx`.
Explicitly ignore `.xlsm`, `.csv`, `.zip` (out of scope for v1).

## 4.2 Link label -> asOfDate parser

Rules:
- Parse `asOfDate` from the link label, e.g.:
  - `1/24` -> `2024-01-01`
  - `7/25` -> `2025-07-01`
  - `July 2025` -> `2025-07-01`
  - `January 1, 2025 update` -> `2025-01-01`
- If unparsable:
  - Use a page-level "last full update" date if present in page text.
    - Set `asOfDateSource="page_last_update"`.
    - `asOfGranularity="day"` if a full date is present; otherwise `asOfGranularity="month"` and store `YYYY-MM-01`.
  - Otherwise classify as `unparsable` and skip (do not silently use today's date).
  - Record unparsable/ambiguous labels in `syncErrors`/`assets` for later review.

Practical note (based on how the current page is structured):
- On `datacurrent.html`, many link labels are region names ("US", "Europe", "Japan", ...) or "Download", not dates.
- In those cases, `asOfDate` should come from the page-level line `Data of last full update: <Month Day, Year>`.

Minimal reference implementation:

```python
# python/damodaran_sync/date_parser.py
from __future__ import annotations

import re
from datetime import date

_MONTH_MAP: dict[str, int] = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}

def parse_link_label_as_of_date(label: str) -> date | None:
    label = label.strip().lower()

    match = re.match(r"^(\d{1,2})/(\d{2})$", label)
    if match:
        month = int(match.group(1))
        year2 = int(match.group(2))
        year = 2000 + year2 if year2 < 50 else 1900 + year2
        return date(year, month, 1)

    match = re.match(r"^([a-z]+)\s+(\d{4})$", label)
    if match:
        month = _MONTH_MAP.get(match.group(1))
        if month is None:
            return None
        return date(int(match.group(2)), month, 1)

    # "January 9, 2025" / "January 1, 2025 update"
    match = re.search(r"([a-z]+)\s+(\d{1,2}),?\s*(\d{4})", label)
    if match:
        month = _MONTH_MAP.get(match.group(1))
        if month is None:
            return None
        day = int(match.group(2))
        year = int(match.group(3))
        return date(year, month, day)

    return None
```

Granularity rules:
- If the label is `M/YY` or `Month YYYY`, treat it as month-level: `asOfDate = YYYY-MM-01` and `asOfGranularity="month"`.
- If the label includes a day (e.g. `January 9, 2025`), treat it as day-level: `asOfDate = YYYY-MM-DD` and `asOfGranularity="day"`.

Page metadata extraction (used as fallback `asOfDate` on `datacurrent.html`):

```python
# python/damodaran_sync/discover.py (sketch)
import re
from bs4 import BeautifulSoup

from damodaran_sync.date_parser import parse_link_label_as_of_date

def extract_page_last_full_update(soup: BeautifulSoup) -> str | None:
    text = soup.get_text(" ", strip=True)
    match = re.search(r"Data of last full update:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})", text, re.I)
    if not match:
        return None
    parsed = parse_link_label_as_of_date(match.group(1))
    return parsed.isoformat() if parsed else None
```

## 4.3 Dataset key + region resolution (pick one mapping authority)

The plan uses a single source of truth for dataset mapping:
- Source of truth: Convex `datasetMappings` table.
- Python loads `datasetMappings`, `datasets` (for `defaultRegionCode`), and `regions` (for `fileTokens`) from Convex at runtime and uses them to resolve each asset.

`python/damodaran_sync/dataset_mappings.py` should contain only seed data (used by `seed` and unit tests), not a separate hardcoded resolver.

Dataset key resolution (runtime):
1. Normalize filename stem to lowercase (no extension).
2. Apply exact mappings first (`isRegex=false`).
3. Apply regex mappings next (`isRegex=true`, evaluated case-insensitively).
4. If still unmapped: set `datasetKey = stem`, auto-create the dataset row in `datasets` (with `categorySlug="unknown"`), and record the event in `syncErrors` and `assets`.

Region resolution (runtime):
1. If the link label is a known region label (common on `datacurrent.html`), map it directly to `regionCode`.
2. Else, search for `regions.fileTokens` in the filename stem remainder (stem after removing the resolved `datasetKey` prefix).
   - If multiple different region tokens match, set `regionCode="unknown"` and log.
   - If `stem` does not actually start with the resolved `datasetKey` (common when mapping is regex-based), do not strip; scan for tokens against the full stem instead.
3. Else, fall back to `datasets.defaultRegionCode` (example: `ctryprem` should be `global`; many "Download" links should be `us`).
4. Else, set `regionCode="unknown"` and log.

Seed data example:

```python
# python/damodaran_sync/dataset_mappings.py
from __future__ import annotations

# Used by the seed command to populate Convex datasetMappings.
SEED_DATASET_MAPPINGS = [
    # Exact matches (stem -> datasetKey)
    {"pattern": "dollarus", "datasetKey": "dollar", "isRegex": False},
    {"pattern": "dollareurope", "datasetKey": "dollar", "isRegex": False},
    {"pattern": "dollarglobal", "datasetKey": "dollar", "isRegex": False},
    {"pattern": "r&d", "datasetKey": "rnd", "isRegex": False},

    # Prefix/regex matches (covers region variants like waccEurope, betaJapan, ...)
    {"pattern": "^ctryprem.*", "datasetKey": "ctryprem", "isRegex": True},
    {"pattern": "^totalbeta.*", "datasetKey": "totalbeta", "isRegex": True},
    {"pattern": "^beta.*", "datasetKey": "beta", "isRegex": True},
    {"pattern": "^wacc.*", "datasetKey": "wacc", "isRegex": True},
]

# Used when a link label encodes region (common on datacurrent.html).
REGION_LABEL_TO_CODE = {
    "us": "us",
    "u.s.": "us",
    "u.s": "us",
    "europe": "europe",
    "japan": "japan",
    "aus, nz & canada": "ausnzcan",
    "all emerging mkts": "emerging",
    "only china": "china",
    "just china": "china",
    "only india": "india",
    "just india": "india",
    "global": "global",
}
```

---

# Phase 5: Downloader (Python)

Requirements:
- Global rate limit across all HTTP requests (HTML + files), e.g. 1 request/sec.
- Retries with exponential backoff for transient errors (timeouts, connection errors, 429/5xx).
- Cache raw files under `.cache/damodaran/raw/` (or user-provided cache dir).
- Compute `sha256` hash for each downloaded file.

---

# Phase 6: Excel parsing + normalization (Python)

Do not assume every file uses a single sheet name or fixed header row.

Heuristics (v1):
1. Pick a sheet:
   - Prefer "Industry Averages"/"Data"/"Sheet1" if present.
   - Otherwise pick the sheet with the most non-empty rows.
2. Find header row:
   - Scan first N rows (e.g. 50) for a row with several non-empty cells and a plausible dimension label in column 0.
3. Normalize:
   - Numbers -> floats
   - Percent strings like "5.4%" -> 0.054
   - Empty -> None
   - Other -> trimmed string

Record parse metadata (sheet name, header row, column names, row count).

Multi-sheet evidence (v1 still ingests one table):
- Record `sheetCandidates` as all sheet names in the workbook.
- Record `skippedSheets` as all sheet names that were not selected.
- Optionally compute and record a simple selection score per sheet (not required for v1 ingestion).

---

# Phase 7: Transform to Convex rows (Python)

Convert each parsed table into generic rows:
- `primaryKey`: first column (industry/country/date/etc)
- `secondaryKey`: optional second dimension (only when it is clearly a dimension; see heuristic below)
- `metrics`: dict of remaining columns -> normalized values

Secondary key heuristic (v1):
- Default: do not set `secondaryKey` (keep it `None`) and treat all non-primary columns as metrics.
- Only set `secondaryKey` when the second column is very likely a dimension, for example:
  - The column header matches a dimension-like name (case-insensitive): `country`, `region`, `rating`, `year`, `date`, `period`, `currency`.
  - AND the values are mostly non-numeric (or date-like) with low cardinality relative to row count.
- If the second column header looks like a metric (examples: `number of firms`, `n`, `count`, `%`), it must stay in `metrics` even if values are non-numeric.

## 7.1 Storage bounds & externalization

Set explicit bounds so oversized datasets do not fail unpredictably.

Policy (configurable defaults):
- Convex-only when `rowCount <= 50_000` **and** serialized JSON bytes `<= 5_000_000` per dataset version **and** per-row bytes stay below a safe threshold (e.g., `<= 30_000` bytes per row).
- If either limit is exceeded, store the full normalized table externally (S3/R2/etc.) and keep only metadata + a deterministic sample or aggregate in Convex.
  - Record `storageType="external"`, `externalProvider`, `externalUrl`, `externalRowCount`, `externalByteSize`.
  - Insert only the sample rows into `tableData`, and record `sampleStrategy` + `sampleRowCount` on the snapshot.
  - If sampling uses randomness, seed with 42 for reproducibility.

Sizing approach:
- After transform (before upload), compute `rowCount` and `approxBytes = len(json.dumps(rows).encode("utf-8"))`.
- Also compute `maxRowBytes` as the largest serialized row size; if above threshold, externalize even when total bytes are small.
- Use those values for the storage decision and to populate snapshot metadata.
- External storage configuration (bucket, base URL, credentials) should be env-driven and excluded from git.

---

# Phase 8: Convex mutations/queries (ingestion + read)

Create small modules:
- `convex/snapshots.ts`: upsert snapshot by identity, fetch existing snapshot by identity
- `convex/tableData.ts`: delete rows by snapshotId, batch insert rows (chunked)
- `convex/syncLogs.ts`: create/update logs, increment counters safely
- `convex/syncErrors.ts`: append per-file errors (separate table)
- `convex/assets.ts`: record discovery results (optional but recommended)
- `convex/seed.ts`: seed/upsert reference data

Important: do not implement `Promise.all(records.map(insert))` for large inserts. Use chunking and sequential inserts inside mutations, and keep payload sizes bounded.

Recommended ingestion safety:
- Use a Convex env var `DAMODARAN_SYNC_TOKEN`.
- Every ingestion mutation takes an arg `syncToken` and rejects if it does not match.
- Read-only reference queries (like `seed:getReference`) are public and do not require `syncToken`.

## 8.1 Concrete function contracts (so Python and Convex agree)

Seed:
- `seed:upsertAll(syncToken: string | null)` -> void
  - Upserts categories/regions/datasets/datasetMappings.

Reference reads (Python uses these at runtime):
- `seed:getReference()` (public read-only; no `syncToken`) -> `{ regions, datasets, datasetMappings }`
  - Regions include `code` and `fileTokens`.
  - Datasets include `key` and `defaultRegionCode`.
  - Dataset mappings include `pattern`, `datasetKey`, and `isRegex`.

Sync logs:
- `syncLogs:create(syncToken: string | null, syncType: string, pageLastUpdated?: string)` -> syncLogId
- `syncLogs:increment(syncToken: string | null, syncLogId: Id<"syncLogs">, delta: { assetsDiscovered?: number; assetsDownloaded?: number; assetsSkipped?: number; rowsInserted?: number; errorCount?: number })` -> void
- `syncLogs:finish(syncToken: string | null, syncLogId: Id<"syncLogs">, status: string)` -> void

Sync errors:
- `syncErrors:append(syncToken: string | null, syncLogId: Id<"syncLogs">, file: string, stage: string, error: string)` -> void

Assets (optional but recommended):
- `assets:record(syncToken: string | null, asset: { sourcePageUrl: string; pageType: string; pageLastUpdated?: string; sourceUrl: string; fileName: string; linkLabel: string; resolved: boolean; resolvedDatasetKey?: string; resolvedRegionCode?: string; resolvedAsOfDate?: string; resolvedAsOfDateSource?: string; resolutionError?: string })` -> void

Snapshots:
- `snapshots:getByIdentity(datasetKey: string, regionCode: string, asOfDate: string)` -> snapshot | null
- `snapshots:upsertByIdentity(syncToken: string | null, identity + metadata..., buildId: string)` -> `{ snapshotId, action, previousBuildId?: string }`
  - `action` is one of: `"created" | "unchanged" | "updated"`
  - If no snapshot exists: create it with `activeBuildId=buildId`, `dataStatus="ready"`, and return `"created"`.
  - If existing snapshot has same `fileHash`, return `"unchanged"`.
  - If `fileHash` differs, set `dataStatus="rebuilding"`, set `pendingBuildId=buildId`, return `"updated"` plus the prior `activeBuildId` as `previousBuildId`. Do **not** change `activeBuildId` or overwrite metadata until finalize.
- `snapshots:finalizeRebuild(syncToken: string | null, snapshotId: Id<"snapshots">, buildId: string, metadata...)` -> void
  - Sets `activeBuildId=buildId`, clears `pendingBuildId`, sets `dataStatus="ready"`, and updates `fileHash` + metadata (including appending to `previousFileHashes`).

Table data:
- `tableData:insertBatch(syncToken: string | null, snapshotId: Id<"snapshots">, buildId: string, rows: Array<{ rowIndex: number; primaryKey: string; secondaryKey?: string; metrics: any }>)` -> `{ inserted: number }`
  - Hard cap: max 100 rows per call (Python chunks).
- `tableData:deleteBySnapshotBuild(syncToken: string | null, snapshotId: Id<"snapshots">, buildId: string, limit: number)` -> `{ deleted: number }`
  - Deletes up to `limit` rows for that (snapshotId, buildId) pair using the `by_snapshot_build_rowIndex` index.

Read semantics (must enforce):
- All read queries must use `snapshots.activeBuildId` and filter `tableData` by `(snapshotId, activeBuildId)`.
- Expose a helper query (e.g., `tableData:listBySnapshot(snapshotId, limit?, cursor?)`) that resolves the active build and only returns rows from that build.

## 8.2 Replace strategy (fileHash changed)

If `snapshots:upsertByIdentity` returns `"updated"`:
1. Use the same `buildId` (UUID) you passed into `snapshots:upsertByIdentity`, which also set `pendingBuildId`.
2. Insert new rows into `tableData` with that `buildId` using `tableData:insertBatch` (chunks of 50-100).
3. Call `snapshots:finalizeRebuild` to swap `activeBuildId` to the new `buildId`, clear `pendingBuildId`, set `dataStatus="ready"`, and update metadata/file hashes.
4. Delete old rows by calling `tableData:deleteBySnapshotBuild` for the returned `previousBuildId` in a loop (limit=500) until 0 deleted.
5. Update `syncLogs.rowsInserted` and `syncLogs.errorCount` incrementally.

## 8.3 Recovery / cleanup (interrupted rebuilds)

If a prior run left `dataStatus="rebuilding"` with a `pendingBuildId`:
1. If the current sync will **not** resume that exact `pendingBuildId`, delete rows for `(snapshotId, pendingBuildId)` in batches.
2. Set `dataStatus="ready"` and clear `pendingBuildId`.
3. Log the recovery as a `syncErrors` entry (`stage="recover"`) or in `syncLogs` (optional).
4. If the current sync **will** resume the pending build, continue inserting rows and call `snapshots:finalizeRebuild` when complete.

---

# Phase 9: Python Convex client + CLI

Create `python/damodaran_sync/convex_client.py` and `python/damodaran_sync/cli.py`.

Environment variables:
- `CONVEX_URL` (required): Convex deployment URL.
- `DAMODARAN_SYNC_TOKEN` (optional but recommended): token that must match Convex env var.
- `DAMODARAN_CACHE_DIR` (optional): override `.cache/damodaran/`.

Local development convenience:
- Put `CONVEX_URL=...` and `DAMODARAN_SYNC_TOKEN=...` in a `.env` file (gitignored) and load it in `cli.py` using `python-dotenv`.

CLI commands:
- `cd python`
- `python -m damodaran_sync.cli seed`
- `python -m damodaran_sync.cli sync-current`
- `python -m damodaran_sync.cli sync-all`

---

# Phase 10: Automation (GitHub Actions)

Create these workflows under `.github/workflows/`:

General note:
- If a workflow needs the Convex CLI, install Bun and use `bunx`/`bun` (no `npm`/`npx`).

## 10.1 Weekly sync

`damodaran-weekly-sync.yml`:
- Schedule weekly + manual trigger.
- Install Python 3.12.
- `pip install -r python/requirements.txt`
- Run the CLI from the `python/` directory (so imports resolve): `python -m damodaran_sync.cli sync-current`
- Provide `CONVEX_URL` and `DAMODARAN_SYNC_TOKEN` via GitHub secrets.

Note:
- This workflow assumes Convex functions are already deployed (it does not run `npx convex deploy`).

## 10.2 CI (lint + tests)

`ci.yml`:
- Trigger on `pull_request` (every PR).
- Install Python 3.12.
- `pip install -r python/requirements.txt`
- Run fast checks: `pytest -q python/tests`.
- Optional (recommended): add `ruff`/`black`/`mypy` once configured.

## 10.3 Codespell

`codespell.yml`:
- Trigger on `pull_request` (every PR).
- Use `codespell-project/actions-codespell` or `codespell` via `pip`.
- Ignore common false positives via `.codespellrc` if needed (add to repo root).

---

# Phase 11: Tests & validation

Unit tests (fast):
- dataset mapping resolution (special cases + region extraction)
- link label date parsing (including invalid labels)

Optional integration smoke test (slow):
- download one known file (e.g. `wacc.xls`)
- parse and transform
- assert non-empty rows and sane columns

Validation query (Convex):
- return counts for `categories`, `regions`, `datasets`, `snapshots`, and total rows in `tableData` (bounded / approximate).
