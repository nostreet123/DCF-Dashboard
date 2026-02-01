import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
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

const DataStatus = v.union(v.literal("ready"), v.literal("rebuilding"));

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

const snapshotValidator = v.object({
  _id: v.id("snapshots"),
  _creationTime: v.number(),
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
});

const snapshotBatchResultValidator = v.object({
  datasetKey: v.string(),
  regionCode: v.string(),
  asOfDate: v.string(),
  snapshotId: v.id("snapshots"),
  fileHash: v.string(),
  sourceEtag: v.optional(v.string()),
  sourceLastModified: v.optional(v.string()),
  dataStatus: v.optional(DataStatus),
  activeBuildId: v.optional(v.string()),
  primaryKeyNormComplete: v.boolean(),
});

const upsertAction = v.union(
  v.literal("created"),
  v.literal("updated"),
  v.literal("unchanged"),
);

type SnapshotBatchResult = {
  datasetKey: string;
  regionCode: string;
  asOfDate: string;
  snapshotId: Id<"snapshots">;
  fileHash: string;
  sourceEtag?: string;
  sourceLastModified?: string;
  dataStatus?: "ready" | "rebuilding";
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
const DEFAULT_REBUILD_LIMIT = 200;
const MAX_REBUILD_LIMIT = 2000;

const normalizeLimit = (
  requested: number | undefined,
  defaultLimit: number,
  maxLimit: number,
) => {
  if (requested === undefined) {
    return defaultLimit;
  }
  const parsed = Number(requested);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: "Limit must be a positive integer",
    });
  }
  return Math.min(parsed, maxLimit);
};

type SnapshotPick = {
  _id: Id<"snapshots">;
  activeBuildId?: string;
  pendingBuildId?: string;
  downloadedAt?: number;
  parsedAt?: number;
  _creationTime: number;
};

const pickBestSnapshot = (snapshots: SnapshotPick[]) => {
  if (snapshots.length === 0) {
    return null;
  }
  const score = (snapshot: SnapshotPick) => [
    snapshot.activeBuildId ? 1 : 0,
    snapshot.pendingBuildId ? 1 : 0,
    snapshot.downloadedAt ?? 0,
    snapshot.parsedAt ?? 0,
    snapshot._creationTime,
  ];
  let best = snapshots[0];
  let bestScore = score(best);
  for (let i = 1; i < snapshots.length; i += 1) {
    const candidate = snapshots[i];
    const candidateScore = score(candidate);
    for (let j = 0; j < candidateScore.length; j += 1) {
      if (candidateScore[j] > bestScore[j]) {
        best = candidate;
        bestScore = candidateScore;
        break;
      }
      if (candidateScore[j] < bestScore[j]) {
        break;
      }
    }
  }
  return best;
};

const findSnapshotByIdentity = async (
  ctx: { db: any },
  datasetKey: string,
  regionCode: string,
  asOfDate: string,
) => {
  const matches = await ctx.db
    .query("snapshots")
    .withIndex("by_identity", (q: any) =>
      q.eq("datasetKey", datasetKey).eq("regionCode", regionCode).eq("asOfDate", asOfDate),
    )
    .take(3);
  if (matches.length === 0) {
    return null;
  }
  if (matches.length === 1) {
    return matches[0];
  }
  if (matches.length === 2) {
    return pickBestSnapshot(matches) ?? matches[0];
  }
  const allMatches = await ctx.db
    .query("snapshots")
    .withIndex("by_identity", (q: any) =>
      q.eq("datasetKey", datasetKey).eq("regionCode", regionCode).eq("asOfDate", asOfDate),
    )
    .collect();
  return pickBestSnapshot(allMatches) ?? matches[0];
};

export const getByIdentity = query({
  args: {
    datasetKey: v.string(),
    regionCode: v.string(),
    asOfDate: v.string(),
  },
  returns: v.union(v.null(), snapshotValidator),
  handler: async (ctx, args) => {
    return findSnapshotByIdentity(ctx, args.datasetKey, args.regionCode, args.asOfDate);
  },
});

export const getById = query({
  args: {
    snapshotId: v.id("snapshots"),
  },
  returns: v.union(v.null(), snapshotValidator),
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
  returns: v.array(snapshotBatchResultValidator),
  handler: async (ctx, args) => {
    if (args.identities.length === 0) {
      return [];
    }
    if (args.identities.length > MAX_IDENTITY_BATCH) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message:
          `Too many identities (${args.identities.length}); ` +
          `max ${MAX_IDENTITY_BATCH}. Reduce DAMODARAN_SNAPSHOT_BATCH_SIZE.`,
      });
    }

    const results: SnapshotBatchResult[] = [];
    const seen = new Set<string>();
    for (const identity of args.identities) {
      const key = `${identity.datasetKey}||${identity.regionCode}||${identity.asOfDate}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const snapshot = await findSnapshotByIdentity(
        ctx,
        identity.datasetKey,
        identity.regionCode,
        identity.asOfDate,
      );
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

export const listByDatasetRegion = query({
  args: {
    datasetKey: v.string(),
    regionCode: v.string(),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  returns: v.object({
    snapshots: v.array(
      v.object({
        _id: v.id("snapshots"),
        asOfDate: v.string(),
        asOfDateSource: AsOfDateSource,
        asOfGranularity: AsOfGranularity,
        dataStatus: DataStatus,
        activeBuildId: v.optional(v.string()),
        pendingBuildId: v.optional(v.string()),
        fileName: v.string(),
        downloadedAt: v.number(),
        parsedAt: v.number(),
      }),
    ),
    nextCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const limit = normalizeLimit(args.limit, 50, 200);
    const result = await ctx.db
      .query("snapshots")
      .withIndex("by_identity", (q: any) =>
        q.eq("datasetKey", args.datasetKey).eq("regionCode", args.regionCode),
      )
      .order("desc")
      .paginate({
        cursor: args.cursor ?? null,
        numItems: limit,
      });

    return {
      snapshots: result.page.map((snapshot: any) => ({
        _id: snapshot._id,
        asOfDate: snapshot.asOfDate,
        asOfDateSource: snapshot.asOfDateSource,
        asOfGranularity: snapshot.asOfGranularity,
        dataStatus: snapshot.dataStatus,
        activeBuildId: snapshot.activeBuildId,
        pendingBuildId: snapshot.pendingBuildId,
        fileName: snapshot.fileName,
        downloadedAt: snapshot.downloadedAt,
        parsedAt: snapshot.parsedAt,
      })),
      nextCursor: result.continueCursor ?? null,
    };
  },
});

export const listRebuilding = query({
  args: {
    syncToken: v.optional(v.string()),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    snapshots: v.array(
      v.object({
        _id: v.id("snapshots"),
        datasetKey: v.string(),
        regionCode: v.string(),
        asOfDate: v.string(),
        fileName: v.string(),
        activeBuildId: v.optional(v.string()),
        pendingBuildId: v.optional(v.string()),
        downloadedAt: v.number(),
        parsedAt: v.number(),
      }),
    ),
    nextCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const limit = normalizeLimit(
      args.limit,
      DEFAULT_REBUILD_LIMIT,
      MAX_REBUILD_LIMIT,
    );
    const result = await ctx.db
      .query("snapshots")
      .withIndex("by_dataStatus", (q: any) => q.eq("dataStatus", "rebuilding"))
      .paginate({ cursor: args.cursor ?? null, numItems: limit });
    return {
      snapshots: result.page.map((snapshot: any) => ({
        _id: snapshot._id,
        datasetKey: snapshot.datasetKey,
        regionCode: snapshot.regionCode,
        asOfDate: snapshot.asOfDate,
        fileName: snapshot.fileName,
        activeBuildId: snapshot.activeBuildId,
        pendingBuildId: snapshot.pendingBuildId,
        downloadedAt: snapshot.downloadedAt,
        parsedAt: snapshot.parsedAt,
      })),
      nextCursor: result.continueCursor ?? null,
    };
  },
});

export const clearRebuilding = mutation({
  args: {
    syncToken: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    examined: v.number(),
    cleared: v.number(),
    clearedWithoutActive: v.number(),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const limit = normalizeLimit(
      args.limit,
      DEFAULT_REBUILD_LIMIT,
      MAX_REBUILD_LIMIT,
    );
    const snapshots = await ctx.db
      .query("snapshots")
      .withIndex("by_dataStatus", (q: any) => q.eq("dataStatus", "rebuilding"))
      .take(limit);
    let cleared = 0;
    let clearedWithoutActive = 0;
    for (const snapshot of snapshots) {
      if (snapshot.activeBuildId) {
        await ctx.db.patch(snapshot._id, {
          dataStatus: "ready",
          pendingBuildId: undefined,
        });
        cleared += 1;
        continue;
      }
      await ctx.db.patch(snapshot._id, {
        dataStatus: "ready",
        pendingBuildId: undefined,
        fileHash: "cleared",
      });
      cleared += 1;
      clearedWithoutActive += 1;
    }
    return { examined: snapshots.length, cleared, clearedWithoutActive };
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
  returns: v.object({
    snapshotId: v.id("snapshots"),
    action: upsertAction,
    previousBuildId: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);

    let existing = await findSnapshotByIdentity(
      ctx,
      args.datasetKey,
      args.regionCode,
      args.asOfDate,
    );

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
        existing = await findSnapshotByIdentity(
          ctx,
          args.datasetKey,
          args.regionCode,
          args.asOfDate,
        );
        if (!existing) {
          throw error;
        }
      }
    }

    if (existing.dataStatus === "rebuilding") {
      if (existing.pendingBuildId !== args.buildId) {
        if (!args.forceRebuild) {
          throw new ConvexError({
            code: "CONFLICT",
            message: "Snapshot rebuild already in progress",
          });
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
  returns: v.null(),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);

    const existing = await ctx.db.get(args.snapshotId);
    if (!existing) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Snapshot not found",
      });
    }

    if (existing.dataStatus !== "rebuilding") {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Snapshot is not rebuilding",
      });
    }

    if (!existing.pendingBuildId) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Snapshot has no pending build",
      });
    }

    if (existing.pendingBuildId !== args.buildId) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Build ID does not match pending build",
      });
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
    return null;
  },
});

export const markPrimaryKeyNormComplete = mutation({
  args: {
    syncToken: v.optional(v.string()),
    snapshotId: v.id("snapshots"),
    buildId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);

    const snapshot = await ctx.db.get(args.snapshotId);
    if (!snapshot) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Snapshot not found",
      });
    }
    if (snapshot.activeBuildId !== args.buildId) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Build ID does not match active build",
      });
    }

    await ctx.db.patch(args.snapshotId, { primaryKeyNormComplete: true });
    return null;
  },
});
