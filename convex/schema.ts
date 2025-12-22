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
    previousFileHashes: v.optional(v.array(v.string())),

    dataStatus: DataStatus,
    activeBuildId: v.string(),
    pendingBuildId: v.optional(v.string()),

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
    .index("by_dataset_region", ["datasetKey", "regionCode"])
    .index("by_asOfDate", ["asOfDate"]),

  tableData: defineTable({
    snapshotId: v.id("snapshots"),
    buildId: v.string(),
    rowIndex: v.number(),
    primaryKey: v.string(),
    secondaryKey: v.optional(v.string()),
    metrics: v.any(),
  })
    .index("by_snapshot_build_rowIndex", ["snapshotId", "buildId", "rowIndex"])
    .index("by_snapshot_build_primaryKey", [
      "snapshotId",
      "buildId",
      "primaryKey",
    ]),

  // -----------------------------
  // Operational logs
  // -----------------------------
  syncLogs: defineTable({
    syncType: v.string(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    status: SyncStatus,

    assetsDiscovered: v.number(),
    assetsDownloaded: v.number(),
    assetsSkipped: v.number(),
    rowsInserted: v.number(),
    errorCount: v.number(),

    pageLastUpdated: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_startedAt", ["startedAt"]),

  syncErrors: defineTable({
    syncLogId: v.id("syncLogs"),
    file: v.string(),
    error: v.string(),
    timestamp: v.number(),
    stage: SyncStage,
  }).index("by_syncLogId_timestamp", ["syncLogId", "timestamp"]),

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

    discoveredAt: v.number(),
  })
    .index("by_pageType_discoveredAt", ["pageType", "discoveredAt"])
    .index("by_resolved_discoveredAt", ["resolved", "discoveredAt"]),
});
