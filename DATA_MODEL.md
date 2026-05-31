# DCF Dashboard — Data Model

> **Warning: This file is hand-maintained and may drift from source. When in doubt, check
> the source files listed in each section header.**
>
> Source-aligned data model reference for the Convex database layer, Python service layer,
> and TypeScript UI layer. Derived from `convex/schema.ts`, `python/dcf_engine/`,
> `python/damodaran_sync/`, and `lib/` source files.

---

## Table of Contents

1. [Enum Reference](#enum-reference)
2. [Section 1: Database Layer (Convex)](#section-1-database-layer-convex)
   - [1a: Core Reference & Snapshot Data](#1a-core-reference--snapshot-data)
   - [1b: Company Fundamentals & Valuation Runs](#1b-company-fundamentals--valuation-runs)
   - [1c: Sync Operations](#1c-sync-operations)
   - [1d: Maintenance & Security](#1d-maintenance--security)
   - [1e: User-Reviewed Imports](#1e-user-reviewed-imports)
3. [Section 2: Service Layer (Python)](#section-2-service-layer-python)
   - [2a: DCF Engine — Core Models](#2a-dcf-engine--core-models)
   - [2b: Workbench API — Request & Response](#2b-workbench-api--request--response)
   - [2c: Sync Pipeline — Dataclasses](#2c-sync-pipeline--dataclasses)
4. [Section 3: UI Layer (TypeScript)](#section-3-ui-layer-typescript)
   - [3a: Workbench State & Actions](#3a-workbench-state--actions)
   - [3b: Catalog & Reference Types](#3b-catalog--reference-types)
5. [Index Reference](#index-reference)
6. [Cross-Layer Mapping](#cross-layer-mapping)

---

## Enum Reference

All enums are defined in `convex/schema.ts` using `v.union(v.literal(...))`.

| Enum | Values | Used In |
|------|--------|---------|
| `DataType` | `industry`, `country`, `timeseries`, `other` | `datasets`, `snapshots` |
| `PageType` | `current`, `archive` | `snapshots`, `assets`, `syncManifests`, `duplicateScanState`, `duplicateCleanupState` |
| `AsOfDateSource` | `label`, `page_last_update`, `filename_inferred` | `snapshots`, `assets` |
| `AsOfGranularity` | `day`, `month` | `snapshots` |
| `DataStatus` | `ready`, `rebuilding` | `snapshots` |
| `StorageType` | `convex`, `external` | `snapshots` |
| `SyncStatus` | `running`, `success`, `partial`, `failed` | `syncLogs` |
| `SyncStage` | `discover`, `download`, `parse`, `transform`, `upload` | `syncErrors` |
| `RunStatus` | `success`, `error` | `valuationRuns` |
| `TraceStorage` | `none`, `inline`, `external` | `valuationRuns` |
| `CoverageState` | `valuation_ready`, `import_required`, `detail_only` | `importedFacts` |
| `ImportedArtifactKind` | `incomeStatement`, `balanceSheet`, `cashFlow`, `sharesMeta` | `importArtifacts` |
| `ImportedArtifactStatus` | `pending`, `approved` | `importArtifacts` |
| `DuplicateScanStatus` | `idle`, `running`, `complete`, `stopped`, `error` | `duplicateScanState` |
| `DuplicateScanPhase` | `snapshots`, `assets` | `duplicateScanState`, `duplicateCleanupState` |
| `DuplicateCleanupStatus` | `idle`, `running`, `complete`, `stopped`, `error` | `duplicateCleanupState` |
| `NonceStatus` | `pending`, `used` | `securityNonces` |

---

## Section 1: Database Layer (Convex)

All tables include an implicit `_id: Id<table>` and `_creationTime: number` added by Convex.
Fields marked `?` are optional (`v.optional(...)`).

### 1a: Core Reference & Snapshot Data

```mermaid
erDiagram
    categories {
        string _id PK
        number _creationTime
        string slug
        string name
        string description
        number sortOrder
    }

    regions {
        string _id PK
        number _creationTime
        string code
        string name
        string[] fileTokens
        number sortOrder
    }

    datasets {
        string _id PK
        number _creationTime
        string key
        string name
        string description
        string categorySlug FK
        DataType dataType
        string defaultRegionCode FK
    }

    datasetMappings {
        string _id PK
        number _creationTime
        string pattern
        string datasetKey FK
        boolean isRegex
    }

    snapshots {
        string _id PK
        number _creationTime
        string datasetKey FK
        string regionCode FK
        string asOfDate
        AsOfDateSource asOfDateSource
        AsOfGranularity asOfGranularity
        string sourcePageUrl
        string sourceUrl
        string fileName
        string linkLabel
        PageType pageType
        string? pageLastUpdated
        string fileHash
        string? sourceEtag
        string? sourceLastModified
        string[]? previousFileHashes
        DataStatus dataStatus
        string? activeBuildId
        string? pendingBuildId
        boolean? primaryKeyNormComplete
        StorageType storageType
        string? externalProvider
        string? externalUrl
        number? externalRowCount
        number? externalByteSize
        string? sampleStrategy
        number? sampleRowCount
        string sheetName
        number headerRow
        string[] columnNames
        string[] metricsKeys
        number rowCount
        DataType dataType
        string[] sheetCandidates
        string[] skippedSheets
        number downloadedAt
        number parsedAt
    }

    tableData {
        string _id PK
        number _creationTime
        string snapshotId FK
        string buildId
        number rowIndex
        string primaryKey
        string primaryKeyNorm
        string? secondaryKey
        record metrics
    }

    categories ||--o{ datasets : "has"
    datasets ||--o{ snapshots : "has"
    regions ||--o{ snapshots : "has"
    datasets ||--o{ datasetMappings : "mapped by"
    snapshots ||--o{ tableData : "contains rows"
```

### 1b: Company Fundamentals & Valuation Runs

```mermaid
erDiagram
    companies {
        string _id PK
        number _creationTime
        string symbol
        string? name
        string? cik
        string? searchText
        string? country
        string? currency
        string source
        number updatedAt
    }

    companyStatements {
        string _id PK
        number _creationTime
        string symbol FK
        string periodEnd
        string periodType
        string? filingDate
        string? currency
        number? revenue
        number? operatingIncome
        number? operatingMargin
        number? cash
        number? debt
        number? sharesOutstanding
        string source
        number updatedAt
    }

    rateLimits {
        string _id PK
        number _creationTime
        string key
        number windowStartMs
        number count
        number updatedAt
    }

    valuationRuns {
        string _id PK
        number _creationTime
        number createdAt
        string engineVersion
        RunStatus status
        string? error
        string? requestId
        string? symbol FK
        record inputs
        record? normalizedInputs
        record? provenance
        record? resultSummary
        string? primaryKeyNorm
        string? regionCode
        string? asOfDate
        TraceStorage traceStorage
        record? trace
        number? traceByteSize
        string? traceId FK
    }

    valuationRunTraces {
        string _id PK
        number _creationTime
        string runId FK
        number createdAt
        number byteSize
        record trace
    }

    companies ||--o{ companyStatements : "has"
    companies ||--o{ valuationRuns : "valued in"
    valuationRuns ||--o| valuationRunTraces : "stored in"
```

### 1c: Sync Operations

```mermaid
erDiagram
    syncLogs {
        string _id PK
        number _creationTime
        string syncType
        number startedAt
        number? completedAt
        SyncStatus status
        string? requestId
        number assetsDiscovered
        number assetsDownloaded
        number assetsSkipped
        number rowsInserted
        number errorCount
        string? pageLastUpdated
    }

    syncLogIncrements {
        string _id PK
        number _creationTime
        string syncLogId FK
        string eventId
        number createdAt
        number? delta_assetsDiscovered
        number? delta_assetsDownloaded
        number? delta_assetsSkipped
        number? delta_rowsInserted
        number? delta_errorCount
    }

    syncManifests {
        string _id PK
        number _creationTime
        PageType pageType
        string manifestHash
        string source
        number itemCount
        number fetchedAt
    }

    syncErrors {
        string _id PK
        number _creationTime
        string syncLogId FK
        string file
        string error
        number timestamp
        SyncStage stage
        string? eventId
    }

    auditLogs {
        string _id PK
        number _creationTime
        string action
        string source
        number createdAt
        record? details
    }

    assets {
        string _id PK
        number _creationTime
        string sourcePageUrl
        PageType pageType
        string? pageLastUpdated
        string sourceUrl
        string fileName
        string linkLabel
        boolean resolved
        string? resolvedDatasetKey FK
        string? resolvedRegionCode FK
        string? resolvedAsOfDate
        AsOfDateSource? resolvedAsOfDateSource
        string? resolutionError
        string? assetKey
        number discoveredAt
    }

    syncLogs ||--o{ syncLogIncrements : "incremented by"
    syncLogs ||--o{ syncErrors : "has"
```

### 1d: Maintenance & Security

```mermaid
erDiagram
    duplicateScanState {
        string _id PK
        number _creationTime
        string key
        DuplicateScanStatus status
        DuplicateScanPhase phase
        number pageLimit
        string? runId
        string? snapshotCursor
        object? snapshotCarry_datasetKey
        object? snapshotCarry_regionCode
        object? snapshotCarry_asOfDate
        string[]? snapshotCarry_ids
        string? assetCursor
        string? assetCarry_assetKey
        string[]? assetCarry_ids
        number snapshotPagesScanned
        number assetPagesScanned
        number snapshotDuplicateGroups
        number assetDuplicateGroups
        object[]? snapshotSample
        object[]? assetSample
        number startedAt
        number updatedAt
        number? finishedAt
        string? error
        number? inFlightUntil
    }

    duplicateCleanupState {
        string _id PK
        number _creationTime
        string key
        DuplicateCleanupStatus status
        DuplicateScanPhase phase
        string scanId FK
        boolean dryRun
        number pageLimit
        string? groupCursor
        string? currentSnapshotGroupId FK
        string[]? snapshotDeleteIds
        string? currentSnapshotId FK
        string? snapshotDeleteCursor
        string? currentAssetGroupId FK
        string[]? assetDeleteIds
        number? assetDeleteIndex
        number snapshotGroupsProcessed
        number snapshotsDeleted
        number tableRowsDeleted
        number assetGroupsProcessed
        number assetsDeleted
        number startedAt
        number updatedAt
        number? finishedAt
        string? error
        number? inFlightUntil
    }

    duplicateSnapshotGroups {
        string _id PK
        number _creationTime
        string scanId FK
        string datasetKey
        string regionCode
        string asOfDate
        number count
        string[] ids
        number createdAt
    }

    duplicateAssetGroups {
        string _id PK
        number _creationTime
        string scanId FK
        string assetKey
        number count
        string[] ids
        number createdAt
    }

    securityNonces {
        string _id PK
        number _creationTime
        string nonce
        NonceStatus status
        number expiresAt
        number createdAt
        number updatedAt
    }

    securityRateBuckets {
        string _id PK
        number _creationTime
        string bucketKey
        number count
        number resetAt
        number updatedAt
    }

    duplicateScanState ||--o{ duplicateSnapshotGroups : "finds"
    duplicateScanState ||--o{ duplicateAssetGroups : "finds"
    duplicateScanState ||--o| duplicateCleanupState : "cleaned by"
    duplicateCleanupState }o--|| duplicateSnapshotGroups : "processes"
    duplicateCleanupState }o--|| duplicateAssetGroups : "processes"
```

### 1e: User-Reviewed Imports

CSV/XLSX/PDF imports are parsed into `importArtifacts` (pending review), and on approval the
reviewed statement facts are written to `importedFacts`. Both are keyed by `listingId`.
`importedFacts.artifactIds` lists the `importArtifacts.artifactId` values that produced the facts;
this is a logical string reference, not a Convex `v.id(...)` foreign key.

```mermaid
erDiagram
    importArtifacts {
        string _id PK
        number _creationTime
        string listingId
        string artifactId
        ImportedArtifactKind kind
        ImportedArtifactStatus status
        string originalFilename
        string parserName
        string fileFormat
        string? contentType
        number byteSize
        string? storageId FK
        record? parseResult
        number createdAt
        number? approvedAt
    }

    importedFacts {
        string _id PK
        number _creationTime
        string listingId
        string symbol
        string name
        string? exchangeMic
        string? market
        string? country
        string? currency
        CoverageState coverageState
        string? filingCurrency
        record facts
        record review
        record provenance
        object[] sourceLinks
        string[] artifactIds
        number approvedAt
        number updatedAt
    }

```

---

## Section 2: Service Layer (Python)

`[M]` = Pydantic `BaseModel`. `[D]` = frozen `@dataclass` unless noted.
Required fields have no default; defaults are shown in the Notes column.
Fields marked `?` are optional (type includes `| None`).

### 2a: DCF Engine — Core Models

Source: `python/dcf_engine/schema.py`, `python/dcf_engine/normalization.py`, `python/dcf_engine/reference/provider.py`

#### `InputAssumptions` [M]

| Field | Type | Notes |
|-------|------|-------|
| `base_year` | `int` | Base year for t=0 |
| `currency?` | `str \| None` | Reporting currency code; default `None` |
| `periods` | `int` | Forecast years; default `10`, min 1 |
| `revenue_t0` | `float` | Revenue at t=0 |
| `revenue_growth` | `list[float]` | Growth for years t=1..N |
| `ebit_margin?` | `list[float] \| None` | EBIT margin for t=1..N; default `None` |
| `tax_rate?` | `list[float] \| None` | Tax rate for t=1..N; default `None` |
| `sales_to_capital?` | `list[float] \| None` | Sales-to-capital for t=1..N; default `None` |
| `reinvestment_lag_years` | `int` | Lag for reinvestment; default `0`, min 0 |
| `wacc?` | `list[float] \| None` | WACC for t=1..N; default `None` |
| `g_stable` | `float` | Stable growth rate for terminal value |
| `wacc_stable` | `float` | Stable WACC for terminal value |
| `cash` | `float` | Excess cash added to firm value; default `0.0` |
| `debt` | `float` | Debt subtracted from firm value; default `0.0` |
| `other_non_operating_assets` | `float` | Other non-operating assets; default `0.0` |
| `shares_outstanding` | `float` | Shares outstanding; min > 0 |
| `failure_probability?` | `float \| None` | Probability of distress; default `None` |
| `distress_recovery_fraction?` | `float \| None` | Recovery fraction on failure; default `None` |

#### `NormalizedAssumptions` [M]

All list fields are guaranteed non-null after normalization.

| Field | Type | Notes |
|-------|------|-------|
| `base_year` | `int` | |
| `periods` | `int` | |
| `currency?` | `str \| None` | |
| `revenue_t0` | `float` | |
| `revenue_growth` | `list[float]` | |
| `ebit_margin` | `list[float]` | Non-null after normalization |
| `tax_rate` | `list[float]` | Non-null after normalization |
| `sales_to_capital` | `list[float]` | Non-null after normalization |
| `reinvestment_lag_years` | `int` | |
| `wacc` | `list[float]` | Non-null after normalization |
| `g_stable` | `float` | |
| `wacc_stable` | `float` | |
| `cash` | `float` | |
| `debt` | `float` | |
| `other_non_operating_assets` | `float` | |
| `shares_outstanding` | `float` | |
| `failure_probability?` | `float \| None` | |
| `distress_recovery_fraction?` | `float \| None` | |

#### `ForecastSchedule` [M]

| Field | Type | Notes |
|-------|------|-------|
| `t` | `list[int]` | Period indices (1..N) |
| `years` | `list[int]` | Calendar years corresponding to each period |

#### `ForecastTable` [M]

| Field | Type | Notes |
|-------|------|-------|
| `t` | `list[int]` | Period indices |
| `years` | `list[int]` | Calendar years |
| `revenue` | `list[float]` | |
| `revenue_growth` | `list[float]` | |
| `ebit_margin` | `list[float]` | |
| `ebit` | `list[float]` | |
| `tax_rate` | `list[float]` | |
| `nopat` | `list[float]` | Net operating profit after tax |
| `sales_to_capital` | `list[float]` | |
| `reinvestment` | `list[float]` | |
| `fcff` | `list[float]` | Free cash flow to firm |

#### `DiscountingTable` [M]

| Field | Type | Notes |
|-------|------|-------|
| `t` | `list[int]` | Period indices |
| `years` | `list[int]` | Calendar years |
| `wacc` | `list[float]` | |
| `discount_factor` | `list[float]` | |
| `pv_fcff` | `list[float]` | Present value of FCFF per period |
| `terminal_value` | `float` | Gordon growth terminal value |
| `pv_terminal` | `float` | Present value of terminal value |

#### `BridgeTable` [M]

| Field | Type | Notes |
|-------|------|-------|
| `firm_value` | `float` | Sum of PV(FCFF) + PV(terminal) |
| `cash` | `float` | |
| `other_non_operating_assets` | `float` | |
| `debt` | `float` | |
| `equity_value` | `float` | firm_value + cash + other_non_op - debt |
| `equity_value_adjusted?` | `float \| None` | After distress adjustment |
| `shares_outstanding` | `float` | |
| `value_per_share` | `float` | equity_value / shares |
| `fair_value_per_share` | `float` | Uses adjusted equity if available |

#### `ValuationResult` [M]

| Field | Type | Notes |
|-------|------|-------|
| `firm_value` | `float` | |
| `pv_fcff` | `float` | Total PV of explicit forecast FCFF |
| `terminal_value` | `float` | |
| `pv_terminal` | `float` | |
| `equity_value` | `float` | |
| `equity_value_adjusted?` | `float \| None` | |
| `value_per_share` | `float` | |
| `fair_value_per_share` | `float` | |

#### `Trace` [M]

| Field | Type | Notes |
|-------|------|-------|
| `schedule` | `ForecastSchedule` | |
| `forecast` | `ForecastTable` | |
| `discounting` | `DiscountingTable` | |
| `bridge` | `BridgeTable` | |

#### `MetricProvenance` [D]

Source: `python/dcf_engine/normalization.py`

| Field | Type | Notes |
|-------|------|-------|
| `dataset_key` | `str` | |
| `region_code` | `str` | |
| `snapshot_id` | `str` | |
| `as_of_date` | `str` | |
| `active_build_id` | `str` | |
| `primary_key_norm` | `str` | |
| `column` | `str` | Column name the metric was pulled from |

#### `Provenance` [D]

| Field | Type | Notes |
|-------|------|-------|
| `wacc?` | `MetricProvenance \| None` | default `None` |
| `tax_rate?` | `MetricProvenance \| None` | default `None` |
| `ebit_margin?` | `MetricProvenance \| None` | default `None` |
| `beta?` | `MetricProvenance \| None` | default `None` |
| `sources` | `dict[str, str]` | default `{}` |

#### `ReferenceSelector` [D]

| Field | Type | Notes |
|-------|------|-------|
| `primary_key_norm` | `str` | |
| `region_code` | `str` | |
| `as_of_date?` | `str \| None` | |
| `policy` | `ReferencePolicy` | `"latest"` or `"at_or_before"`; default `"latest"` |

#### `SnapshotRef` [D]

Source: `python/dcf_engine/reference/provider.py`

| Field | Type | Notes |
|-------|------|-------|
| `snapshot_id` | `str` | |
| `dataset_key` | `str` | |
| `region_code` | `str` | |
| `as_of_date` | `str` | |
| `active_build_id` | `str` | |
| `column_names` | `list[str]` | |
| `metrics_keys` | `list[str]` | |

#### `RowRef` [D]

| Field | Type | Notes |
|-------|------|-------|
| `snapshot` | `SnapshotRef` | |
| `primary_key_norm` | `str` | |
| `secondary_key?` | `str \| None` | |
| `metrics` | `dict[str, object]` | |

---

### 2b: Workbench API — Request & Response

Source: `python/dcf_engine/workbench/schema.py`

All models extend `WorkbenchBaseModel` which sets `populate_by_name=True` — both the
snake_case field name and the camelCase alias are valid at construction time.
The `Alias` column shows the camelCase JSON alias where one is defined.

#### `ScenarioAssumptions` [M]

| Field | Type | Alias | Notes |
|-------|------|-------|-------|
| `revenue_growth` | `float` | `revenueGrowth` | Annual revenue growth rate |
| `ebit_margin` | `float` | `ebitMargin` | EBIT margin |
| `tax_rate` | `float` | `taxRate` | Tax rate |
| `sales_to_capital` | `float` | `salesToCapital` | Sales-to-capital ratio |
| `wacc` | `float` | — | WACC |
| `g_stable` | `float` | `gStable` | Stable growth rate |
| `wacc_stable` | `float` | `waccStable` | Stable WACC |

#### `SensitivitySpec` [M]

| Field | Type | Alias | Notes |
|-------|------|-------|-------|
| `growth_offsets` | `list[float]` | `growthOffsets` | default `[-0.02, -0.01, 0.0, 0.01, 0.02]` |
| `wacc_offsets` | `list[float]` | `waccOffsets` | default `[-0.02, -0.01, 0.0, 0.01, 0.02]` |

#### `MonteCarloIndependence` [M]

| Field | Type | Alias | Notes |
|-------|------|-------|-------|
| `model` | `Literal["independent"]` | — | default `"independent"` |

#### `MonteCarloOneFactor` [M]

| Field | Type | Alias | Notes |
|-------|------|-------|-------|
| `model` | `Literal["oneFactor"]` | — | default `"oneFactor"` |
| `loading` | `float` | — | Common factor loading; default `0.75`, range [0, 0.99] |

#### `MonteCarloSpec` [M]

`MonteCarloDependenceSpec = MonteCarloIndependence | MonteCarloOneFactor` (discriminated on `model`).

| Field | Type | Alias | Notes |
|-------|------|-------|-------|
| `runs` | `int` | — | Simulation count; default `2000`, range [100, 20000] |
| `seed?` | `int \| None` | — | Random seed; default `None` |
| `bins?` | `int \| None` | — | Histogram bins; default `None`, range [10, 200] |
| `dependence?` | `MonteCarloDependenceSpec \| None` | — | default `None` |

#### `StatementInput` [M]

| Field | Type | Alias | Notes |
|-------|------|-------|-------|
| `period_end` | `str` | `periodEnd` | Period end date |
| `revenue?` | `float \| None` | — | default `None` |
| `cash?` | `float \| None` | — | default `None` |
| `debt?` | `float \| None` | — | default `None` |
| `shares_outstanding?` | `float \| None` | `sharesOutstanding` | default `None` |

#### `WorkbenchRequest` [M]

| Field | Type | Alias | Notes |
|-------|------|-------|-------|
| `base_year` | `int` | `baseYear` | Base year for t=0 |
| `periods` | `int` | — | Forecast periods; default `10`, min 1 |
| `currency?` | `str \| None` | — | Reporting currency; default `None` |
| `revenue_t0` | `float` | `revenueT0` | Base revenue |
| `cash` | `float` | — | default `0.0` |
| `debt` | `float` | — | default `0.0` |
| `other_non_operating_assets` | `float` | `otherNonOperatingAssets` | default `0.0` |
| `shares_outstanding` | `float` | `sharesOutstanding` | |
| `reinvestment_lag_years` | `int` | `reinvestmentLagYears` | default `0`, min 0 |
| `base` | `ScenarioAssumptions` | — | Base scenario |
| `bull` | `ScenarioAssumptions` | — | Bull scenario |
| `bear` | `ScenarioAssumptions` | — | Bear scenario |
| `sensitivity?` | `SensitivitySpec \| None` | — | default `None` |
| `monte_carlo?` | `MonteCarloSpec \| None` | `monteCarlo` | default `None` |
| `statements?` | `list[StatementInput] \| None` | — | Optional KPI history input; default `None` |
| `include_trace` | `bool` | `includeTrace` | default `False` |

#### `KpiValue` [M]

`KpiDirection = Literal["higher", "lower"]`

| Field | Type | Alias | Notes |
|-------|------|-------|-------|
| `key` | `str` | — | KPI identifier |
| `label` | `str` | — | Display label |
| `value?` | `float \| None` | — | Raw KPI value; default `None` |
| `score?` | `float \| None` | — | Score 0–100; default `None` |
| `direction` | `KpiDirection` | — | `"higher"` or `"lower"` |
| `unit?` | `str \| None` | — | Unit label; default `None` |

#### `KpiHistoryPoint` [M]

| Field | Type | Alias | Notes |
|-------|------|-------|-------|
| `period_end` | `str` | `periodEnd` | |
| `revenue?` | `float \| None` | — | default `None` |
| `cash?` | `float \| None` | — | default `None` |
| `debt?` | `float \| None` | — | default `None` |
| `shares_outstanding?` | `float \| None` | `sharesOutstanding` | default `None` |

#### `KpiSummary` [M]

| Field | Type | Alias | Notes |
|-------|------|-------|-------|
| `kpis` | `list[KpiValue]` | — | default `[]` |
| `history` | `list[KpiHistoryPoint]` | — | default `[]` |

#### `ScenarioResult` [M]

| Field | Type | Alias | Notes |
|-------|------|-------|-------|
| `label` | `str` | — | e.g. `"base"`, `"bull"`, `"bear"` |
| `assumptions` | `ScenarioAssumptions` | — | |
| `valuation` | `ValuationResult` | — | From `dcf_engine.schema` |
| `trace?` | `Trace \| None` | — | Populated when `include_trace=True`; default `None` |

#### `SensitivityResult` [M]

| Field | Type | Alias | Notes |
|-------|------|-------|-------|
| `growth_offsets` | `list[float]` | `growthOffsets` | default `[]` |
| `wacc_offsets` | `list[float]` | `waccOffsets` | default `[]` |
| `values` | `list[list[float]]` | — | Heatmap matrix; default `[]` |

#### `MonteCarloSummary` [M]

| Field | Type | Notes |
|-------|------|-------|
| `min` | `float` | Minimum simulated fair value per share |
| `max` | `float` | |
| `mean` | `float` | |
| `median` | `float` | |
| `p10` | `float` | 10th percentile |
| `p25` | `float` | 25th percentile |
| `p75` | `float` | 75th percentile |
| `p90` | `float` | 90th percentile |

#### `MonteCarloHistogram` [M]

| Field | Type | Alias | Notes |
|-------|------|-------|-------|
| `bin_centers` | `list[float]` | `binCenters` | default `[]` |
| `density` | `list[float]` | — | Normalized heights (max=1); default `[]` |

#### `MonteCarloResult` [M]

| Field | Type | Notes |
|-------|------|-------|
| `runs` | `int` | Completed simulation count |
| `seed?` | `int \| None` | Random seed used; default `None` |
| `summary` | `MonteCarloSummary` | |
| `histogram` | `MonteCarloHistogram` | |

#### `WorkbenchResponse` [M]

| Field | Type | Alias | Notes |
|-------|------|-------|-------|
| `base` | `ScenarioResult` | — | |
| `bull` | `ScenarioResult` | — | |
| `bear` | `ScenarioResult` | — | |
| `sensitivity` | `SensitivityResult` | — | |
| `kpis` | `KpiSummary` | — | |
| `monte_carlo?` | `MonteCarloResult \| None` | `monteCarlo` | default `None` |

---

### 2c: Sync Pipeline — Dataclasses

Source: `python/damodaran_sync/discover.py`, `download.py`, `excel_parse.py`, `transform.py`, `mirror.py`, `sync_resolution.py`, `convex_client_models.py`

All are frozen `@dataclass` except `ResolvedAsset` which is **mutable** (no `frozen=True`).

#### `DiscoveredAsset` [D]

| Field | Type | Notes |
|-------|------|-------|
| `source_page_url` | `str` | URL of the Damodaran HTML page |
| `page_type` | `str` | `"current"` or `"archive"` |
| `page_last_updated?` | `str \| None` | |
| `source_url` | `str` | Direct download URL |
| `file_name` | `str` | Filename extracted from URL |
| `link_label` | `str` | Anchor text from the HTML page |
| `as_of_date?` | `str \| None` | ISO date inferred from label or filename |
| `as_of_date_source?` | `str \| None` | How date was inferred |
| `as_of_granularity?` | `str \| None` | `"day"` or `"month"` |
| `resolution_error?` | `str \| None` | Set if dataset/region mapping failed |

#### `PageDiscovery` [D]

| Field | Type | Notes |
|-------|------|-------|
| `page_url` | `str` | |
| `page_type` | `str` | |
| `page_last_updated?` | `str \| None` | |
| `assets` | `list[DiscoveredAsset]` | |

#### `MirrorManifest` [D]

| Field | Type | Notes |
|-------|------|-------|
| `page_type` | `str` | |
| `manifest_hash` | `str` | SHA-256 of manifest payload |
| `assets` | `list[DiscoveredAsset]` | |
| `source` | `str` | URL the manifest was fetched from |

#### `DownloadResult` [D]

| Field | Type | Notes |
|-------|------|-------|
| `url` | `str` | |
| `path` | `Path` | Local cache path |
| `sha256` | `str` | |
| `size_bytes` | `int` | |
| `from_cache` | `bool` | `True` if served from local cache |
| `etag?` | `str \| None` | HTTP ETag; default `None` |
| `last_modified?` | `str \| None` | HTTP Last-Modified; default `None` |
| `not_modified` | `bool` | `True` if server returned 304; default `False` |

#### `ProbeResult` [D]

| Field | Type | Notes |
|-------|------|-------|
| `url` | `str` | |
| `status_code` | `int` | HTTP status code from HEAD request |
| `etag?` | `str \| None` | default `None` |
| `last_modified?` | `str \| None` | default `None` |
| `not_modified` | `bool` | default `False` |

#### `ParsedTable` [D]

| Field | Type | Notes |
|-------|------|-------|
| `sheet_name` | `str` | Selected sheet name |
| `header_row` | `int` | 0-based row index of the header |
| `column_names` | `list[str]` | |
| `rows` | `list[list[object]]` | Raw cell values |
| `row_count` | `int` | |
| `sheet_candidates` | `list[str]` | All sheets considered |
| `skipped_sheets` | `list[str]` | Sheets skipped during selection |

#### `NormalizedRow` [D]

| Field | Type | Notes |
|-------|------|-------|
| `row_index` | `int` | 0-based index in the source table |
| `primary_key` | `str` | Raw primary key (e.g. industry name) |
| `primary_key_norm` | `str` | Normalized for cross-snapshot matching |
| `secondary_key?` | `str \| None` | For tables with two dimension columns |
| `metrics` | `dict[str, object]` | Numeric metric values keyed by column name |

#### `TransformResult` [D]

| Field | Type | Notes |
|-------|------|-------|
| `rows` | `list[NormalizedRow]` | May be a sample if oversized |
| `row_count` | `int` | Total rows before sampling |
| `approx_bytes` | `int` | Estimated JSON byte size |
| `max_row_bytes` | `int` | Largest single row in bytes |
| `storage_type` | `str` | `"convex"` or `"external"` |
| `external_row_count?` | `int \| None` | If stored externally |
| `external_byte_size?` | `int \| None` | If stored externally |
| `sample_strategy?` | `str \| None` | Sampling method used if oversized |
| `sample_row_count?` | `int \| None` | Number of rows in sample |
| `metrics_keys` | `list[str]` | Ordered list of metric column names |

#### `ResolvedAsset` [D, mutable]

`ResolvedAsset` is a **mutable** `@dataclass` (no `frozen=True`). The `snapshot` field is
populated in-place after the Convex upsert.

| Field | Type | Notes |
|-------|------|-------|
| `asset` | `DiscoveredAsset` | |
| `dataset_key` | `str` | |
| `region_code` | `str` | |
| `resolution_error?` | `str \| None` | |
| `resolved_ds` | `bool` | `True` if dataset mapping succeeded |
| `snapshot?` | `dict[str, Any] \| None` | Populated after Convex upsert; default `None` |

#### `SnapshotUpsertResult` [D]

| Field | Type | Notes |
|-------|------|-------|
| `snapshot_id` | `str` | Convex document ID |
| `action` | `str` | `"created"`, `"updated"`, or `"noop"` |
| `previous_build_id?` | `str \| None` | Old build ID to clean up |

---

## Section 3: UI Layer (TypeScript)

### 3a: Workbench State & Actions

Source: `lib/contexts/WorkbenchContext.tsx`, `lib/workbench/scenarioProfiles.ts`, `lib/hooks/useDcfCompute.ts`, `lib/hooks/useWorkbenchViewState.ts`

#### `Assumptions` (interface)

`Scenario = 'base' | 'bull' | 'bear'`

| Field | Type | Notes |
|-------|------|-------|
| `revenueGrowth` | `number` | |
| `operatingMargin` | `number` | |
| `discountRate` | `number` | |
| `terminalGrowth` | `number` | |

#### `ScenarioChip` (interface)

`ScenarioChipDirection = 'up' | 'down' | 'neutral'`

| Field | Type | Notes |
|-------|------|-------|
| `label` | `string` | Display label |
| `value` | `string` | Formatted value string (e.g. `"12%"`) |
| `direction` | `ScenarioChipDirection` | |

#### `ValuationResult` (interface)

Defined in `WorkbenchContext.tsx`; distinct from the Python `ValuationResult`.

| Field | Type | Notes |
|-------|------|-------|
| `fairValue` | `number` | |
| `range` | `[number, number]` | Bull/bear range |
| `histogram` | `{ binCenters: number[]; density: number[] }` | Monte Carlo distribution |
| `sensitivityMatrix` | `number[][]` | WACC × growth grid |

#### `WorkbenchState` (interface)

| Field | Type | Notes |
|-------|------|-------|
| `selectedSymbol` | `string \| null` | |
| `selectedCompanyId` | `string \| null` | |
| `selectedRunId` | `string \| null` | |
| `scenario` | `Scenario` | Active scenario tab |
| `assumptions` | `Record<Scenario, Assumptions>` | Per-scenario assumption sets |
| `result` | `ValuationResult \| null` | |
| `isComputing` | `boolean` | |
| `error` | `Error \| null` | |

#### `WorkbenchAction` (discriminated union)

| `type` | Additional fields | Notes |
|--------|-------------------|-------|
| `set_selected_symbol` | `symbol: string \| null` | |
| `set_selected_company_id` | `id: string \| null` | |
| `set_selected_run_id` | `id: string \| null` | |
| `select_company` | `id: string \| null; symbol: string \| null` | Clears `selectedRunId` |
| `set_scenario` | `scenario: Scenario` | |
| `update_assumption` | `key: keyof Assumptions; value: number` | Updates active scenario only |
| `set_result` | `result: ValuationResult \| null` | |
| `set_is_computing` | `isComputing: boolean` | |
| `set_error` | `error: Error \| null` | |
| `reset` | — | Resets to initial state |

#### `DcfInputs` (interface)

| Field | Type | Notes |
|-------|------|-------|
| `symbol` | `string` | |
| `revenueGrowth` | `number` | |
| `operatingMargin` | `number` | |
| `discountRate` | `number` | |
| `terminalGrowth` | `number` | |
| `scenario?` | `'base' \| 'bull' \| 'bear'` | optional |

#### `DcfResult` (interface)

| Field | Type | Notes |
|-------|------|-------|
| `fairValue` | `number` | |
| `range` | `[number, number]` | |
| `histogram` | `{ binCenters: number[]; density: number[] }` | |
| `sensitivityMatrix` | `number[][]` | |
| `projections` | `Array<{ year: number; revenue: number; operatingIncome: number; freeCashFlow: number }>` | Year-by-year forecast |

#### `WorkbenchViewState` (interface)

`ViewMode = 'workbench' | 'investor'`
`DrawerState = 'library' | 'assumptions' | null`

| Field | Type | Notes |
|-------|------|-------|
| `viewMode` | `ViewMode` | default `'workbench'` |
| `activeDrawer` | `DrawerState` | default `null` |

#### `DatasetItem` (interface)

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | |
| `name` | `string` | |
| `ticker` | `string` | |

---

### 3b: Catalog & Reference Types

Source: `lib/hooks/useCatalog.ts`, `lib/hooks/useCompanySearch.ts`, `lib/hooks/useValuationHistory.ts`

#### `Category` (interface)

| Field | Type | Notes |
|-------|------|-------|
| `slug` | `string` | |
| `name` | `string` | |
| `description` | `string` | |
| `sortOrder` | `number` | |
| `datasets` | `Dataset[]` | |

#### `Dataset` (interface)

| Field | Type | Notes |
|-------|------|-------|
| `key` | `string` | |
| `name` | `string` | |
| `description` | `string` | |
| `categorySlug` | `string` | |
| `dataType` | `'industry' \| 'country' \| 'timeseries' \| 'other'` | |
| `defaultRegionCode` | `string` | |

#### `Region` (interface)

| Field | Type | Notes |
|-------|------|-------|
| `code` | `string` | |
| `name` | `string` | |
| `sortOrder` | `number` | |

#### `CatalogData` (interface)

| Field | Type | Notes |
|-------|------|-------|
| `categories` | `Category[]` | |
| `regions` | `Region[]` | |

#### `Company` (interface)

| Field | Type | Notes |
|-------|------|-------|
| `_id` | `string` | Convex document ID |
| `symbol` | `string` | |
| `name?` | `string` | optional |
| `cik?` | `string` | optional |
| `country?` | `string` | optional |
| `currency?` | `string` | optional |
| `source` | `string` | |
| `updatedAt` | `number` | |

#### `ValuationRun` (interface)

`resultSummary` is an inline type within `ValuationRun`.

| Field | Type | Notes |
|-------|------|-------|
| `_id` | `string` | Convex document ID |
| `_creationTime` | `number` | |
| `createdAt` | `number` | |
| `engineVersion` | `string` | |
| `status` | `'success' \| 'error'` | |
| `error?` | `string` | optional |
| `requestId?` | `string` | optional |
| `symbol?` | `string` | optional |
| `inputs` | `unknown` | Raw JSON inputs blob |
| `normalizedInputs?` | `unknown` | optional |
| `provenance?` | `unknown` | optional |
| `resultSummary?` | `{ fairValue?: number; range?: [number, number]; histogram?: { binCenters: number[]; density: number[] } }` | optional |
| `primaryKeyNorm?` | `string` | optional |
| `regionCode?` | `string` | optional |
| `asOfDate?` | `string` | optional |
| `traceStorage` | `'none' \| 'inline' \| 'external'` | |

---

## Index Reference

All indexes defined in `convex/schema.ts`. One search index is also defined on `tableData`.

| Table | Index Name | Fields |
|-------|-----------|--------|
| `categories` | `by_slug` | `slug` |
| `regions` | `by_code` | `code` |
| `datasets` | `by_key` | `key` |
| `datasets` | `by_category` | `categorySlug` |
| `datasetMappings` | `by_identity` | `pattern, datasetKey, isRegex` |
| `datasetMappings` | `by_datasetKey` | `datasetKey` |
| `snapshots` | `by_identity` | `datasetKey, regionCode, asOfDate` |
| `snapshots` | `by_dataStatus` | `dataStatus` |
| `snapshots` | `by_dataset_region` | `datasetKey, regionCode` |
| `snapshots` | `by_asOfDate` | `asOfDate` |
| `tableData` | `by_snapshot_build_rowIndex` | `snapshotId, buildId, rowIndex` |
| `tableData` | `by_snapshot_build_primaryKey` | `snapshotId, buildId, primaryKey` |
| `tableData` | `by_snapshot_build_primaryKeyNorm` | `snapshotId, buildId, primaryKeyNorm` |
| `tableData` | `by_snapshot_build_primaryKeyNorm_secondaryKey` | `snapshotId, buildId, primaryKeyNorm, secondaryKey` |
| `tableData` | `search_primaryKey` *(search)* | searchField: `primaryKey`; filterFields: `snapshotId, buildId` |
| `companies` | `by_symbol` | `symbol` |
| `companies` | `search_text` *(search)* | searchField: `searchText` |
| `companyStatements` | `by_symbol_and_periodEnd` | `symbol, periodEnd` |
| `companyStatements` | `by_symbol_and_filingDate` | `symbol, filingDate` |
| `rateLimits` | `by_key` | `key` |
| `rateLimits` | `by_updatedAt` | `updatedAt` |
| `syncLogs` | `by_status` | `status` |
| `syncLogs` | `by_startedAt` | `startedAt` |
| `syncLogs` | `by_requestId` | `requestId` |
| `syncLogIncrements` | `by_eventId` | `eventId` |
| `syncLogIncrements` | `by_syncLogId_createdAt` | `syncLogId, createdAt` |
| `syncLogIncrements` | `by_createdAt` | `createdAt` |
| `syncManifests` | `by_pageType_fetchedAt` | `pageType, fetchedAt` |
| `syncManifests` | `by_manifestHash` | `manifestHash` |
| `syncErrors` | `by_syncLogId_timestamp` | `syncLogId, timestamp` |
| `syncErrors` | `by_eventId` | `eventId` |
| `syncErrors` | `by_timestamp` | `timestamp` |
| `auditLogs` | `by_createdAt` | `createdAt` |
| `duplicateScanState` | `by_key` | `key` |
| `duplicateCleanupState` | `by_key` | `key` |
| `duplicateSnapshotGroups` | `by_scanId` | `scanId` |
| `duplicateSnapshotGroups` | `by_scanId_identity` | `scanId, datasetKey, regionCode, asOfDate` |
| `duplicateAssetGroups` | `by_scanId` | `scanId` |
| `duplicateAssetGroups` | `by_scanId_assetKey` | `scanId, assetKey` |
| `assets` | `by_pageType_discoveredAt` | `pageType, discoveredAt` |
| `assets` | `by_resolved_discoveredAt` | `resolved, discoveredAt` |
| `assets` | `by_assetKey` | `assetKey` |
| `securityNonces` | `by_nonce` | `nonce` |
| `securityNonces` | `by_expiresAt` | `expiresAt` |
| `securityRateBuckets` | `by_bucketKey` | `bucketKey` |
| `securityRateBuckets` | `by_resetAt` | `resetAt` |
| `importArtifacts` | `by_artifactId` | `artifactId` |
| `importArtifacts` | `by_listingId_status` | `listingId, status` |
| `importArtifacts` | `by_listingId_createdAt` | `listingId, createdAt` |
| `importedFacts` | `by_listingId` | `listingId` |
| `importedFacts` | `by_listingId_updatedAt` | `listingId, updatedAt` |
| `importedFacts` | `by_symbol_updatedAt` | `symbol, updatedAt` |
| `importedFacts` | `by_country_updatedAt` | `country, updatedAt` |
| `valuationRuns` | `by_createdAt` | `createdAt` |
| `valuationRuns` | `by_primaryKeyNorm_createdAt` | `primaryKeyNorm, createdAt` |
| `valuationRuns` | `by_primaryKeyNorm_region_createdAt` | `primaryKeyNorm, regionCode, createdAt` |
| `valuationRuns` | `by_symbol_createdAt` | `symbol, createdAt` |
| `valuationRuns` | `by_requestId` | `requestId` |
| `valuationRunTraces` | `by_runId` | `runId` |
| `valuationRunTraces` | `by_createdAt` | `createdAt` |

---

## Cross-Layer Mapping

Conceptual entities and which layer(s) they appear in.

| Concept | Convex Table | Python Service | TypeScript UI |
|---------|-------------|----------------|---------------|
| Dataset catalog | `datasets`, `categories`, `regions` | — | `Dataset`, `Category`, `Region`, `CatalogData` |
| Dataset file mapping | `datasetMappings` | — | — |
| Snapshot (file version) | `snapshots` | `SnapshotRef` | — |
| Row data | `tableData` | `NormalizedRow`, `RowRef` | — |
| Company fundamentals | `companies`, `companyStatements` | — | `Company` |
| Reviewed import artifacts | `importArtifacts` | — | — |
| Imported company facts | `importedFacts` | — | — |
| DCF inputs | `valuationRuns.inputs` | `InputAssumptions`, `ScenarioAssumptions`, `WorkbenchRequest` | `DcfInputs`, `Assumptions` |
| DCF normalized inputs | `valuationRuns.normalizedInputs` | `NormalizedAssumptions` | — |
| DCF result summary | `valuationRuns.resultSummary` | `ValuationResult`, `WorkbenchResponse` | `ValuationResult` (UI), `DcfResult` |
| DCF full trace | `valuationRunTraces.trace` | `Trace` | — |
| Valuation run history | `valuationRuns` | — | `ValuationRun` |
| Reference provenance | `valuationRuns.provenance` | `Provenance`, `MetricProvenance` | — |
| Sync run log | `syncLogs` | — | — |
| Sync error | `syncErrors` | — | — |
| Sync manifest | `syncManifests` | `MirrorManifest` | — |
| Discovered asset | `assets` | `DiscoveredAsset`, `ResolvedAsset` | — |
| Downloaded file | — | `DownloadResult`, `ProbeResult` | — |
| Parsed Excel table | — | `ParsedTable` | — |
| Transformed rows | — | `NormalizedRow`, `TransformResult` | — |
| Snapshot upsert result | — | `SnapshotUpsertResult` | — |
| Rate limit bucket | `rateLimits`, `securityRateBuckets` | — | — |
| Security nonce | `securityNonces` | — | — |
| Duplicate scan | `duplicateScanState`, `duplicateSnapshotGroups`, `duplicateAssetGroups` | — | — |
| Duplicate cleanup | `duplicateCleanupState` | — | — |
| Audit log | `auditLogs` | — | — |
| UI workbench state | — | — | `WorkbenchState`, `WorkbenchViewState` |
| UI scenario chip | — | — | `ScenarioChip` |
