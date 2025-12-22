import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const SnapshotMetadata = v.object({
  asOfDateSource: v.string(),
  asOfGranularity: v.string(),
  sourcePageUrl: v.string(),
  sourceUrl: v.string(),
  fileName: v.string(),
  linkLabel: v.string(),
  pageType: v.string(),
  pageLastUpdated: v.optional(v.string()),
  fileHash: v.string(),
  storageType: v.string(),
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
  dataType: v.string(),
  sheetCandidates: v.array(v.string()),
  skippedSheets: v.array(v.string()),
  downloadedAt: v.number(),
  parsedAt: v.number(),
});

const requireSyncToken = (syncToken: string | null | undefined) => {
  const expected = process.env.DAMODARAN_SYNC_TOKEN;
  if (expected && syncToken !== expected) {
    throw new Error("Invalid sync token");
  }
};

export const getByIdentity = query({
  args: {
    datasetKey: v.string(),
    regionCode: v.string(),
    asOfDate: v.string(),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("snapshots")
      .withIndex("by_identity", (q) =>
        q
          .eq("datasetKey", args.datasetKey)
          .eq("regionCode", args.regionCode)
          .eq("asOfDate", args.asOfDate),
      )
      .unique();
  },
});

export const upsertByIdentity = mutation({
  args: {
    syncToken: v.optional(v.string()),
    datasetKey: v.string(),
    regionCode: v.string(),
    asOfDate: v.string(),
    buildId: v.string(),
    metadata: SnapshotMetadata,
  },
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);

    const existing = await ctx.db
      .query("snapshots")
      .withIndex("by_identity", (q) =>
        q
          .eq("datasetKey", args.datasetKey)
          .eq("regionCode", args.regionCode)
          .eq("asOfDate", args.asOfDate),
      )
      .unique();

    if (!existing) {
      const snapshotId = await ctx.db.insert("snapshots", {
        datasetKey: args.datasetKey,
        regionCode: args.regionCode,
        asOfDate: args.asOfDate,
        asOfDateSource: args.metadata.asOfDateSource,
        asOfGranularity: args.metadata.asOfGranularity,
        sourcePageUrl: args.metadata.sourcePageUrl,
        sourceUrl: args.metadata.sourceUrl,
        fileName: args.metadata.fileName,
        linkLabel: args.metadata.linkLabel,
        pageType: args.metadata.pageType,
        pageLastUpdated: args.metadata.pageLastUpdated,
        fileHash: args.metadata.fileHash,
        previousFileHashes: [],
        dataStatus: "ready",
        activeBuildId: args.buildId,
        pendingBuildId: undefined,
        storageType: args.metadata.storageType,
        externalProvider: args.metadata.externalProvider,
        externalUrl: args.metadata.externalUrl,
        externalRowCount: args.metadata.externalRowCount,
        externalByteSize: args.metadata.externalByteSize,
        sampleStrategy: args.metadata.sampleStrategy,
        sampleRowCount: args.metadata.sampleRowCount,
        sheetName: args.metadata.sheetName,
        headerRow: args.metadata.headerRow,
        columnNames: args.metadata.columnNames,
        metricsKeys: args.metadata.metricsKeys,
        rowCount: args.metadata.rowCount,
        dataType: args.metadata.dataType,
        sheetCandidates: args.metadata.sheetCandidates,
        skippedSheets: args.metadata.skippedSheets,
        downloadedAt: args.metadata.downloadedAt,
        parsedAt: args.metadata.parsedAt,
      });

      return { snapshotId, action: "created" as const };
    }

    if (existing.fileHash === args.metadata.fileHash) {
      return { snapshotId: existing._id, action: "unchanged" as const };
    }

    await ctx.db.patch(existing._id, {
      dataStatus: "rebuilding",
      pendingBuildId: args.buildId,
    });

    return {
      snapshotId: existing._id,
      action: "updated" as const,
      previousBuildId: existing.activeBuildId,
    };
  },
});

export const finalizeRebuild = mutation({
  args: {
    syncToken: v.optional(v.string()),
    snapshotId: v.id("snapshots"),
    buildId: v.string(),
    metadata: SnapshotMetadata,
  },
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);

    const existing = await ctx.db.get(args.snapshotId);
    if (!existing) {
      throw new Error("Snapshot not found");
    }

    if (existing.dataStatus !== "rebuilding") {
      throw new Error("Snapshot is not rebuilding");
    }

    if (!existing.pendingBuildId) {
      throw new Error("Snapshot has no pending build");
    }

    if (existing.pendingBuildId !== args.buildId) {
      throw new Error("Build ID does not match pending build");
    }

    const previousHashes = existing.previousFileHashes ?? [];
    const nextPreviousHashes =
      existing.fileHash && existing.fileHash !== args.metadata.fileHash
        ? [...previousHashes, existing.fileHash]
        : previousHashes;

    await ctx.db.patch(args.snapshotId, {
      asOfDateSource: args.metadata.asOfDateSource,
      asOfGranularity: args.metadata.asOfGranularity,
      sourcePageUrl: args.metadata.sourcePageUrl,
      sourceUrl: args.metadata.sourceUrl,
      fileName: args.metadata.fileName,
      linkLabel: args.metadata.linkLabel,
      pageType: args.metadata.pageType,
      pageLastUpdated: args.metadata.pageLastUpdated,
      fileHash: args.metadata.fileHash,
      previousFileHashes: nextPreviousHashes,
      dataStatus: "ready",
      activeBuildId: args.buildId,
      pendingBuildId: undefined,
      storageType: args.metadata.storageType,
      externalProvider: args.metadata.externalProvider,
      externalUrl: args.metadata.externalUrl,
      externalRowCount: args.metadata.externalRowCount,
      externalByteSize: args.metadata.externalByteSize,
      sampleStrategy: args.metadata.sampleStrategy,
      sampleRowCount: args.metadata.sampleRowCount,
      sheetName: args.metadata.sheetName,
      headerRow: args.metadata.headerRow,
      columnNames: args.metadata.columnNames,
      metricsKeys: args.metadata.metricsKeys,
      rowCount: args.metadata.rowCount,
      dataType: args.metadata.dataType,
      sheetCandidates: args.metadata.sheetCandidates,
      skippedSheets: args.metadata.skippedSheets,
      downloadedAt: args.metadata.downloadedAt,
      parsedAt: args.metadata.parsedAt,
    });
  },
});
