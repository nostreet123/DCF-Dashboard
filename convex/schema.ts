import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const DataType = v.union(
  v.literal("industry"),
  v.literal("country"),
  v.literal("timeseries"),
  v.literal("other"),
);

const PageType = v.union(v.literal("current"), v.literal("archive"));

const AsOfDateSource = v.union(
  v.literal("label"),
  v.literal("page_last_update"),
  v.literal("filename_inferred"),
);

const AsOfGranularity = v.union(v.literal("day"), v.literal("month"));

const DataStatus = v.union(v.literal("ready"), v.literal("rebuilding"));

const StorageType = v.union(v.literal("convex"), v.literal("external"));

const SyncStatus = v.union(
  v.literal("running"),
  v.literal("success"),
  v.literal("partial"),
  v.literal("failed"),
);

const SyncStage = v.union(
  v.literal("discover"),
  v.literal("download"),
  v.literal("parse"),
  v.literal("transform"),
  v.literal("upload"),
);

const RunStatus = v.union(v.literal("success"), v.literal("error"));

const TraceStorage = v.union(
  v.literal("none"),
  v.literal("inline"),
  v.literal("external"),
);

const DuplicateScanStatus = v.union(
  v.literal("idle"),
  v.literal("running"),
  v.literal("complete"),
  v.literal("stopped"),
  v.literal("error"),
);

const DuplicateScanPhase = v.union(v.literal("snapshots"), v.literal("assets"));

const DuplicateCleanupStatus = v.union(
  v.literal("idle"),
  v.literal("running"),
  v.literal("complete"),
  v.literal("stopped"),
  v.literal("error"),
);

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
    code: v.string(),
    name: v.string(),
    fileTokens: v.array(v.string()),
    sortOrder: v.number(),
  }).index("by_code", ["code"]),

  datasets: defineTable({
    key: v.string(),
    name: v.string(),
    description: v.string(),
    categorySlug: v.string(),
    dataType: DataType,
    defaultRegionCode: v.string(),
  })
    .index("by_key", ["key"])
    .index("by_category", ["categorySlug"]),

  datasetMappings: defineTable({
    pattern: v.string(),
    datasetKey: v.string(),
    isRegex: v.boolean(),
  })
    .index("by_identity", ["pattern", "datasetKey", "isRegex"])
    .index("by_datasetKey", ["datasetKey"]),

  // -----------------------------
  // Snapshot + data
  // -----------------------------
  snapshots: defineTable({
    datasetKey: v.string(),
    regionCode: v.string(),
    asOfDate: v.string(),
    asOfDateSource: AsOfDateSource,
    asOfGranularity: AsOfGranularity,

    sourcePageUrl: v.string(),
    sourceUrl: v.string(),
    fileName: v.string(),
    linkLabel: v.string(),
    pageType: PageType,
    pageLastUpdated: v.optional(v.string()),

    fileHash: v.string(),
    sourceEtag: v.optional(v.string()),
    sourceLastModified: v.optional(v.string()),
    previousFileHashes: v.optional(v.array(v.string())),

    dataStatus: DataStatus,
    activeBuildId: v.optional(v.string()),
    pendingBuildId: v.optional(v.string()),
    primaryKeyNormComplete: v.optional(v.boolean()),

    storageType: StorageType,
    externalProvider: v.optional(v.string()),
    externalUrl: v.optional(v.string()),
    externalRowCount: v.optional(v.number()),
    externalByteSize: v.optional(v.number()),
    sampleStrategy: v.optional(v.string()),
    sampleRowCount: v.optional(v.number()),

    sheetName: v.string(),
    headerRow: v.number(),
    columnNames: v.array(v.string()),
    metricsKeys: v.array(v.string()),
    rowCount: v.number(),
    dataType: DataType,

    sheetCandidates: v.array(v.string()),
    skippedSheets: v.array(v.string()),

    downloadedAt: v.number(),
    parsedAt: v.number(),
  })
    .index("by_identity", ["datasetKey", "regionCode", "asOfDate"])
    .index("by_dataStatus", ["dataStatus"])
    .index("by_dataset_region", ["datasetKey", "regionCode"])
    .index("by_asOfDate", ["asOfDate"]),

  tableData: defineTable({
    snapshotId: v.id("snapshots"),
    buildId: v.string(),
    rowIndex: v.number(),
    primaryKey: v.string(),
    primaryKeyNorm: v.string(),
    secondaryKey: v.optional(v.string()),
    metrics: v.any(),
  })
    .index("by_snapshot_build_rowIndex", ["snapshotId", "buildId", "rowIndex"])
    .index("by_snapshot_build_primaryKey", [
      "snapshotId",
      "buildId",
      "primaryKey",
    ])
    .index("by_snapshot_build_primaryKeyNorm", [
      "snapshotId",
      "buildId",
      "primaryKeyNorm",
    ])
    .index("by_snapshot_build_primaryKeyNorm_secondaryKey", [
      "snapshotId",
      "buildId",
      "primaryKeyNorm",
      "secondaryKey",
    ])
    .searchIndex("search_primaryKey", {
      searchField: "primaryKey",
      filterFields: ["snapshotId", "buildId"],
    }),

  // -----------------------------
  // Fundamentals cache
  // -----------------------------
  companies: defineTable({
    symbol: v.string(),
    name: v.optional(v.string()),
    cik: v.optional(v.string()),
    country: v.optional(v.string()),
    currency: v.optional(v.string()),
    source: v.string(),
    updatedAt: v.number(),
  })
    .index("by_symbol", ["symbol"])
    .searchIndex("search_name", { searchField: "name" }),

  companyStatements: defineTable({
    symbol: v.string(),
    periodEnd: v.string(),
    periodType: v.string(),
    filingDate: v.optional(v.string()),
    currency: v.optional(v.string()),
    revenue: v.optional(v.number()),
    cash: v.optional(v.number()),
    debt: v.optional(v.number()),
    sharesOutstanding: v.optional(v.number()),
    source: v.string(),
    updatedAt: v.number(),
  })
    .index("by_symbol_and_periodEnd", ["symbol", "periodEnd"])
    .index("by_symbol_and_filingDate", ["symbol", "filingDate"]),

  // -----------------------------
  // Operational logs
  // -----------------------------
  syncLogs: defineTable({
    syncType: v.string(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    status: SyncStatus,
    requestId: v.optional(v.string()),

    assetsDiscovered: v.number(),
    assetsDownloaded: v.number(),
    assetsSkipped: v.number(),
    rowsInserted: v.number(),
    errorCount: v.number(),

    pageLastUpdated: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_startedAt", ["startedAt"])
    .index("by_requestId", ["requestId"]),

  syncLogIncrements: defineTable({
    syncLogId: v.id("syncLogs"),
    eventId: v.string(),
    createdAt: v.number(),
    delta: v.object({
      assetsDiscovered: v.optional(v.number()),
      assetsDownloaded: v.optional(v.number()),
      assetsSkipped: v.optional(v.number()),
      rowsInserted: v.optional(v.number()),
      errorCount: v.optional(v.number()),
    }),
  })
    .index("by_eventId", ["eventId"])
    .index("by_syncLogId_createdAt", ["syncLogId", "createdAt"])
    .index("by_createdAt", ["createdAt"]),

  syncManifests: defineTable({
    pageType: PageType,
    manifestHash: v.string(),
    source: v.string(),
    itemCount: v.number(),
    fetchedAt: v.number(),
  })
    .index("by_pageType_fetchedAt", ["pageType", "fetchedAt"])
    .index("by_manifestHash", ["manifestHash"]),

  syncErrors: defineTable({
    syncLogId: v.id("syncLogs"),
    file: v.string(),
    error: v.string(),
    timestamp: v.number(),
    stage: SyncStage,
    eventId: v.optional(v.string()),
  })
    .index("by_syncLogId_timestamp", ["syncLogId", "timestamp"])
    .index("by_eventId", ["eventId"])
    .index("by_timestamp", ["timestamp"]),

  auditLogs: defineTable({
    action: v.string(),
    source: v.string(),
    createdAt: v.number(),
    details: v.optional(v.any()),
  }).index("by_createdAt", ["createdAt"]),

  duplicateScanState: defineTable({
    key: v.string(),
    status: DuplicateScanStatus,
    phase: DuplicateScanPhase,
    pageLimit: v.number(),

    // Incremented on every start/restart to ignore stale scheduled work.
    runId: v.optional(v.string()),

    snapshotCursor: v.optional(v.string()),
    snapshotCarry: v.optional(
      v.object({
        datasetKey: v.string(),
        regionCode: v.string(),
        asOfDate: v.string(),
        ids: v.array(v.id("snapshots")),
      }),
    ),
    assetCursor: v.optional(v.string()),
    assetCarry: v.optional(
      v.object({
        assetKey: v.string(),
        ids: v.array(v.id("assets")),
      }),
    ),

    snapshotPagesScanned: v.number(),
    assetPagesScanned: v.number(),
    snapshotDuplicateGroups: v.number(),
    assetDuplicateGroups: v.number(),

    snapshotSample: v.optional(
      v.array(
        v.object({
          datasetKey: v.string(),
          regionCode: v.string(),
          asOfDate: v.string(),
          count: v.number(),
          ids: v.array(v.id("snapshots")),
        }),
      ),
    ),
    assetSample: v.optional(
      v.array(
        v.object({
          assetKey: v.string(),
          count: v.number(),
          ids: v.array(v.id("assets")),
        }),
      ),
    ),

    startedAt: v.number(),
    updatedAt: v.number(),
    finishedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    inFlightUntil: v.optional(v.number()),
  }).index("by_key", ["key"]),

  duplicateCleanupState: defineTable({
    key: v.string(),
    status: DuplicateCleanupStatus,
    phase: DuplicateScanPhase,
    scanId: v.id("duplicateScanState"),
    dryRun: v.boolean(),
    pageLimit: v.number(),

    groupCursor: v.optional(v.string()),

    currentSnapshotGroupId: v.optional(v.id("duplicateSnapshotGroups")),
    snapshotDeleteIds: v.optional(v.array(v.id("snapshots"))),
    currentSnapshotId: v.optional(v.id("snapshots")),
    snapshotDeleteCursor: v.optional(v.string()),

    currentAssetGroupId: v.optional(v.id("duplicateAssetGroups")),
    assetDeleteIds: v.optional(v.array(v.id("assets"))),
    assetDeleteIndex: v.optional(v.number()),

    snapshotGroupsProcessed: v.number(),
    snapshotsDeleted: v.number(),
    tableRowsDeleted: v.number(),
    assetGroupsProcessed: v.number(),
    assetsDeleted: v.number(),

    startedAt: v.number(),
    updatedAt: v.number(),
    finishedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    inFlightUntil: v.optional(v.number()),
  }).index("by_key", ["key"]),

  duplicateSnapshotGroups: defineTable({
    scanId: v.id("duplicateScanState"),
    datasetKey: v.string(),
    regionCode: v.string(),
    asOfDate: v.string(),
    count: v.number(),
    ids: v.array(v.id("snapshots")),
    createdAt: v.number(),
  })
    .index("by_scanId", ["scanId"])
    .index("by_scanId_identity", ["scanId", "datasetKey", "regionCode", "asOfDate"]),

  duplicateAssetGroups: defineTable({
    scanId: v.id("duplicateScanState"),
    assetKey: v.string(),
    count: v.number(),
    ids: v.array(v.id("assets")),
    createdAt: v.number(),
  })
    .index("by_scanId", ["scanId"])
    .index("by_scanId_assetKey", ["scanId", "assetKey"]),

  assets: defineTable({
    sourcePageUrl: v.string(),
    pageType: PageType,
    pageLastUpdated: v.optional(v.string()),

    sourceUrl: v.string(),
    fileName: v.string(),
    linkLabel: v.string(),

    resolved: v.boolean(),
    resolvedDatasetKey: v.optional(v.string()),
    resolvedRegionCode: v.optional(v.string()),
    resolvedAsOfDate: v.optional(v.string()),
    resolvedAsOfDateSource: v.optional(AsOfDateSource),
    resolutionError: v.optional(v.string()),

    assetKey: v.optional(v.string()),
    discoveredAt: v.number(),
  })
    .index("by_pageType_discoveredAt", ["pageType", "discoveredAt"])
    .index("by_resolved_discoveredAt", ["resolved", "discoveredAt"])
    .index("by_assetKey", ["assetKey"]),

  // -----------------------------
  // Valuation runs
  // -----------------------------
  valuationRuns: defineTable({
    createdAt: v.number(),
    engineVersion: v.string(),
    status: RunStatus,
    error: v.optional(v.string()),
    requestId: v.optional(v.string()),
    symbol: v.optional(v.string()),
    inputs: v.any(),
    normalizedInputs: v.optional(v.any()),
    provenance: v.optional(v.any()),
    resultSummary: v.optional(v.any()),
    primaryKeyNorm: v.optional(v.string()),
    regionCode: v.optional(v.string()),
    asOfDate: v.optional(v.string()),
    traceStorage: TraceStorage,
    trace: v.optional(v.any()),
    traceByteSize: v.optional(v.number()),
    traceId: v.optional(v.id("valuationRunTraces")),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_primaryKeyNorm_createdAt", ["primaryKeyNorm", "createdAt"])
    .index("by_primaryKeyNorm_region_createdAt", [
      "primaryKeyNorm",
      "regionCode",
      "createdAt",
    ])
    .index("by_symbol_createdAt", ["symbol", "createdAt"])
    .index("by_requestId", ["requestId"]),

  valuationRunTraces: defineTable({
    runId: v.id("valuationRuns"),
    createdAt: v.number(),
    byteSize: v.number(),
    trace: v.any(),
  })
    .index("by_runId", ["runId"])
    .index("by_createdAt", ["createdAt"]),
});
