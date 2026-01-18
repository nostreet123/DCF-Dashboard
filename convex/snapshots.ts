import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { requireSyncToken } from "./syncAuth";

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

const StorageType = v.union(v.literal("convex"), v.literal("external"));

const SnapshotMetadata = v.object({
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
  primaryKeyNormComplete: v.optional(v.boolean()),
});

type SnapshotBatchResult = {
  datasetKey: string;
  regionCode: string;
  asOfDate: string;
  snapshotId: Id<"snapshots">;
  fileHash: string;
  sourceEtag?: string;
  sourceLastModified?: string;
  dataStatus?: string;
  activeBuildId?: string;
  primaryKeyNormComplete: boolean;
};

const isDuplicateIdentityError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("unique") ||
    message.includes("duplicate") ||
    message.includes("already exists")
  );
};

const MAX_IDENTITY_BATCH = 100;

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

export const getById = query({
  args: {
    snapshotId: v.id("snapshots"),
  },
  handler: async (ctx, args) => {
    return ctx.db.get(args.snapshotId);
  },
});

export const getByIdentityBatch = query({
  args: {
    identities: v.array(
      v.object({
        datasetKey: v.string(),
        regionCode: v.string(),
        asOfDate: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    if (args.identities.length === 0) {
      return [];
    }
    if (args.identities.length > MAX_IDENTITY_BATCH) {
      throw new Error(
        `Too many identities (${args.identities.length}); max ${MAX_IDENTITY_BATCH}. Reduce DAMODARAN_SNAPSHOT_BATCH_SIZE.`,
      );
    }

    const results: SnapshotBatchResult[] = [];
    const seen = new Set<string>();
    for (const identity of args.identities) {
      const key = `${identity.datasetKey}||${identity.regionCode}||${identity.asOfDate}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const snapshot = await ctx.db
        .query("snapshots")
        .withIndex("by_identity", (q) =>
          q
            .eq("datasetKey", identity.datasetKey)
            .eq("regionCode", identity.regionCode)
            .eq("asOfDate", identity.asOfDate),
        )
        .unique();
      if (snapshot) {
        results.push({
          datasetKey: identity.datasetKey,
          regionCode: identity.regionCode,
          asOfDate: identity.asOfDate,
          snapshotId: snapshot._id,
          fileHash: snapshot.fileHash,
          sourceEtag: snapshot.sourceEtag,
          sourceLastModified: snapshot.sourceLastModified,
          dataStatus: snapshot.dataStatus,
          activeBuildId: snapshot.activeBuildId,
          primaryKeyNormComplete: snapshot.primaryKeyNormComplete ?? false,
        });
      }
    }
    return results;
  },
});

export const upsertByIdentity = mutation({
  args: {
    syncToken: v.optional(v.string()),
    datasetKey: v.string(),
    regionCode: v.string(),
    asOfDate: v.string(),
    buildId: v.string(),
    forceRebuild: v.optional(v.boolean()),
    metadata: SnapshotMetadata,
  },
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);

    const fetchExisting = () =>
      ctx.db
        .query("snapshots")
        .withIndex("by_identity", (q) =>
          q
            .eq("datasetKey", args.datasetKey)
            .eq("regionCode", args.regionCode)
            .eq("asOfDate", args.asOfDate),
        )
        .unique();

    let existing = await fetchExisting();

    if (!existing) {
      try {
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
          sourceEtag: args.metadata.sourceEtag,
          sourceLastModified: args.metadata.sourceLastModified,
          previousFileHashes: [],
          dataStatus: "rebuilding",
          activeBuildId: undefined,
          pendingBuildId: args.buildId,
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
          primaryKeyNormComplete: args.metadata.primaryKeyNormComplete,
        });

        return { snapshotId, action: "created" as const };
      } catch (error) {
        if (!isDuplicateIdentityError(error)) {
          throw error;
        }
        existing = await fetchExisting();
        if (!existing) {
          throw error;
        }
      }
    }

    if (existing.dataStatus === "rebuilding") {
      if (existing.pendingBuildId !== args.buildId) {
        if (!args.forceRebuild) {
          throw new Error("Snapshot rebuild already in progress");
        }
        await ctx.db.patch(existing._id, {
          pendingBuildId: args.buildId,
        });
      }
      return {
        snapshotId: existing._id,
        action: "updated" as const,
        previousBuildId: existing.activeBuildId,
      };
    }

    if (existing.fileHash === args.metadata.fileHash && !args.forceRebuild) {
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
      sourceEtag: args.metadata.sourceEtag,
      sourceLastModified: args.metadata.sourceLastModified,
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
      primaryKeyNormComplete: args.metadata.primaryKeyNormComplete,
    });
  },
});

export const markPrimaryKeyNormComplete = mutation({
  args: {
    syncToken: v.optional(v.string()),
    snapshotId: v.id("snapshots"),
    buildId: v.string(),
  },
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);

    const snapshot = await ctx.db.get(args.snapshotId);
    if (!snapshot) {
      throw new Error("Snapshot not found");
    }
    if (snapshot.activeBuildId !== args.buildId) {
      throw new Error("Build ID does not match active build");
    }

    await ctx.db.patch(args.snapshotId, { primaryKeyNormComplete: true });
  },
});
