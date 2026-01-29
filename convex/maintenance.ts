import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { requireSyncToken } from "./syncAuth";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { buildAssetKey } from "./assets";

const RetentionDays = v.object({
  syncLogs: v.optional(v.number()),
  syncErrors: v.optional(v.number()),
  syncLogIncrements: v.optional(v.number()),
  valuationRunTraces: v.optional(v.number()),
});

const PageType = v.union(v.literal("current"), v.literal("archive"));

const DuplicateSnapshotCarry = v.object({
  datasetKey: v.string(),
  regionCode: v.string(),
  asOfDate: v.string(),
  ids: v.array(v.id("snapshots")),
});

const DuplicateAssetCarry = v.object({
  assetKey: v.string(),
  ids: v.array(v.id("assets")),
});

const DuplicateScanSampleSnapshots = v.array(
  v.object({
    datasetKey: v.string(),
    regionCode: v.string(),
    asOfDate: v.string(),
    count: v.number(),
    ids: v.array(v.id("snapshots")),
  }),
);

const DuplicateScanSampleAssets = v.array(
  v.object({
    assetKey: v.string(),
    count: v.number(),
    ids: v.array(v.id("assets")),
  }),
);

const makeDuplicateScanRunId = (): string => {
  // No need for crypto-grade randomness; this is only for deconflicting scheduled jobs.
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const normalizeRetentionDays = (value: number | undefined, defaultDays: number) => {
  if (value === undefined) {
    return defaultDays;
  }
  const days = Number(value);
  if (!Number.isInteger(days) || days <= 0) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: "Retention days must be a positive integer",
    });
  }
  return Math.min(days, 3650);
};

const normalizeDeleteLimit = (value: number | undefined, defaultLimit: number) => {
  if (value === undefined) {
    return defaultLimit;
  }
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: "maxDeletes must be a positive integer",
    });
  }
  return Math.min(limit, 1000);
};

const normalizePageLimit = (value: number | undefined, defaultLimit: number) => {
  if (value === undefined) {
    return defaultLimit;
  }
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: "limit must be a positive integer",
    });
  }
  return Math.min(limit, 1000);
};

const cutoffMs = (days: number) => Date.now() - days * 24 * 60 * 60 * 1000;

export const pruneOperationalData = mutation({
  args: {
    syncToken: v.optional(v.string()),
    dryRun: v.optional(v.boolean()),
    retentionDays: v.optional(RetentionDays),
    maxDeletes: v.optional(v.number()),
  },
  returns: v.object({
    dryRun: v.boolean(),
    deleted: v.object({
      syncLogs: v.number(),
      syncErrors: v.number(),
      syncLogIncrements: v.number(),
      valuationRunTraces: v.number(),
    }),
    cutoff: v.object({
      syncLogs: v.number(),
      syncErrors: v.number(),
      syncLogIncrements: v.number(),
      valuationRunTraces: v.number(),
    }),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const dryRun = args.dryRun ?? true;
    const retention = args.retentionDays ?? {};
    const maxDeletes = normalizeDeleteLimit(args.maxDeletes, 200);

    const syncLogsCutoff = cutoffMs(
      normalizeRetentionDays(retention.syncLogs, 30),
    );
    const syncErrorsCutoff = cutoffMs(
      normalizeRetentionDays(retention.syncErrors, 30),
    );
    const syncLogIncrementsCutoff = cutoffMs(
      normalizeRetentionDays(retention.syncLogIncrements, 30),
    );
    const valuationRunTracesCutoff = cutoffMs(
      normalizeRetentionDays(retention.valuationRunTraces, 30),
    );

    let deletedSyncLogs = 0;
    const syncLogs = await ctx.db
      .query("syncLogs")
      .withIndex("by_startedAt", (q) => q)
      .order("asc")
      .take(maxDeletes);
    for (const log of syncLogs) {
      if (log.startedAt >= syncLogsCutoff) {
        break;
      }
      if (!dryRun) {
        await ctx.db.delete(log._id);
      }
      deletedSyncLogs += 1;
    }

    let deletedSyncErrors = 0;
    const syncErrors = await ctx.db
      .query("syncErrors")
      .withIndex("by_timestamp", (q) => q)
      .order("asc")
      .take(maxDeletes);
    for (const error of syncErrors) {
      if (error.timestamp >= syncErrorsCutoff) {
        break;
      }
      if (!dryRun) {
        await ctx.db.delete(error._id);
      }
      deletedSyncErrors += 1;
    }

    let deletedSyncLogIncrements = 0;
    const increments = await ctx.db
      .query("syncLogIncrements")
      .withIndex("by_createdAt", (q) => q)
      .order("asc")
      .take(maxDeletes);
    for (const increment of increments) {
      if (increment.createdAt >= syncLogIncrementsCutoff) {
        break;
      }
      if (!dryRun) {
        await ctx.db.delete(increment._id);
      }
      deletedSyncLogIncrements += 1;
    }

    let deletedTraces = 0;
    const traces = await ctx.db
      .query("valuationRunTraces")
      .withIndex("by_createdAt", (q) => q)
      .order("asc")
      .take(maxDeletes);
    for (const trace of traces) {
      if (trace.createdAt >= valuationRunTracesCutoff) {
        break;
      }
      if (!dryRun) {
        await ctx.db.delete(trace._id);
        await ctx.db.patch(trace.runId, {
          traceId: undefined,
          traceStorage: "none",
        });
      }
      deletedTraces += 1;
    }

    return {
      dryRun,
      deleted: {
        syncLogs: deletedSyncLogs,
        syncErrors: deletedSyncErrors,
        syncLogIncrements: deletedSyncLogIncrements,
        valuationRunTraces: deletedTraces,
      },
      cutoff: {
        syncLogs: syncLogsCutoff,
        syncErrors: syncErrorsCutoff,
        syncLogIncrements: syncLogIncrementsCutoff,
        valuationRunTraces: valuationRunTracesCutoff,
      },
    };
  },
});

export const backfillAssetKeysPage = mutation({
  args: {
    syncToken: v.optional(v.string()),
    pageType: PageType,
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    updated: v.number(),
    nextCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const limit = normalizePageLimit(args.limit, 200);
    const result = await ctx.db
      .query("assets")
      .withIndex("by_pageType_discoveredAt", (q) => q.eq("pageType", args.pageType))
      .paginate({
        cursor: args.cursor ?? null,
        numItems: limit,
      });

    let updated = 0;
    for (const asset of result.page) {
      if (asset.assetKey) {
        continue;
      }
      const assetKey = buildAssetKey({
        sourcePageUrl: asset.sourcePageUrl,
        pageType: asset.pageType,
        pageLastUpdated: asset.pageLastUpdated,
        sourceUrl: asset.sourceUrl,
        fileName: asset.fileName,
        linkLabel: asset.linkLabel,
        resolved: asset.resolved,
        resolvedDatasetKey: asset.resolvedDatasetKey,
        resolvedRegionCode: asset.resolvedRegionCode,
        resolvedAsOfDate: asset.resolvedAsOfDate,
        resolvedAsOfDateSource: asset.resolvedAsOfDateSource,
        resolutionError: asset.resolutionError,
      });
      await ctx.db.patch(asset._id, { assetKey });
      updated += 1;
    }

    return {
      updated,
      nextCursor: result.continueCursor ?? null,
    };
  },
});

export const findDuplicateSnapshotsPage = query({
  args: {
    syncToken: v.optional(v.string()),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    carry: v.optional(DuplicateSnapshotCarry),
  },
  returns: v.object({
    duplicates: v.array(
      v.object({
        datasetKey: v.string(),
        regionCode: v.string(),
        asOfDate: v.string(),
        count: v.number(),
        ids: v.array(v.id("snapshots")),
      }),
    ),
    nextCursor: v.union(v.string(), v.null()),
    carry: v.union(DuplicateSnapshotCarry, v.null()),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    return findDuplicateSnapshotsPageInternalImpl(ctx, args);
  },
});

export const findDuplicateAssetsPage = query({
  args: {
    syncToken: v.optional(v.string()),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    carry: v.optional(DuplicateAssetCarry),
  },
  returns: v.object({
    duplicates: v.array(
      v.object({
        assetKey: v.string(),
        count: v.number(),
        ids: v.array(v.id("assets")),
      }),
    ),
    nextCursor: v.union(v.string(), v.null()),
    carry: v.union(DuplicateAssetCarry, v.null()),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    return findDuplicateAssetsPageInternalImpl(ctx, args);
  },
});

const findDuplicateSnapshotsPageInternalImpl = async (
  ctx: { db: any },
  args: {
    cursor?: string;
    limit?: number;
    carry?: {
      datasetKey: string;
      regionCode: string;
      asOfDate: string;
      ids: Array<Id<"snapshots">>;
    };
  },
) => {
  const limit = normalizePageLimit(args.limit, 200);
  const result = await ctx.db
    .query("snapshots")
    .withIndex("by_identity", (q: any) => q)
    .paginate({
      cursor: args.cursor ?? null,
      numItems: limit,
    });

  const duplicates: Array<{
    datasetKey: string;
    regionCode: string;
    asOfDate: string;
    count: number;
    ids: Array<Id<"snapshots">>;
  }> = [];

  let current =
    args.carry && args.carry.ids.length > 0
      ? {
          datasetKey: args.carry.datasetKey,
          regionCode: args.carry.regionCode,
          asOfDate: args.carry.asOfDate,
          ids: [...args.carry.ids],
        }
      : null;

  const pushCurrentIfDuplicate = () => {
    if (current && current.ids.length > 1) {
      duplicates.push({
        datasetKey: current.datasetKey,
        regionCode: current.regionCode,
        asOfDate: current.asOfDate,
        count: current.ids.length,
        ids: current.ids,
      });
    }
  };

  for (const snapshot of result.page) {
    if (!current) {
      current = {
        datasetKey: snapshot.datasetKey,
        regionCode: snapshot.regionCode,
        asOfDate: snapshot.asOfDate,
        ids: [snapshot._id],
      };
      continue;
    }
    const sameIdentity =
      snapshot.datasetKey === current.datasetKey &&
      snapshot.regionCode === current.regionCode &&
      snapshot.asOfDate === current.asOfDate;
    if (sameIdentity) {
      current.ids.push(snapshot._id);
      continue;
    }
    pushCurrentIfDuplicate();
    current = {
      datasetKey: snapshot.datasetKey,
      regionCode: snapshot.regionCode,
      asOfDate: snapshot.asOfDate,
      ids: [snapshot._id],
    };
  }

  if (!result.continueCursor) {
    pushCurrentIfDuplicate();
  }

  return {
    duplicates,
    nextCursor: result.continueCursor ?? null,
    carry: result.continueCursor ? (current ? current : null) : null,
  };
};

const findDuplicateAssetsPageInternalImpl = async (
  ctx: { db: any },
  args: { cursor?: string; limit?: number; carry?: { assetKey: string; ids: Array<Id<"assets">> } },
) => {
  const limit = normalizePageLimit(args.limit, 200);
  const result = await ctx.db
    .query("assets")
    .withIndex("by_assetKey", (q: any) => q)
    .paginate({
      cursor: args.cursor ?? null,
      numItems: limit,
    });

  const duplicates: Array<{
    assetKey: string;
    count: number;
    ids: Array<Id<"assets">>;
  }> = [];

  let current =
    args.carry && args.carry.ids.length > 0
      ? { assetKey: args.carry.assetKey, ids: [...args.carry.ids] }
      : null;

  const pushCurrentIfDuplicate = () => {
    if (current && current.ids.length > 1) {
      duplicates.push({
        assetKey: current.assetKey,
        count: current.ids.length,
        ids: current.ids,
      });
    }
  };

  for (const asset of result.page) {
    if (!asset.assetKey) {
      continue;
    }
    if (current && asset.assetKey === current.assetKey) {
      current.ids.push(asset._id);
      continue;
    }
    pushCurrentIfDuplicate();
    current = { assetKey: asset.assetKey, ids: [asset._id] };
  }

  if (!result.continueCursor) {
    pushCurrentIfDuplicate();
  }

  return {
    duplicates,
    nextCursor: result.continueCursor ?? null,
    carry: result.continueCursor ? (current ? current : null) : null,
  };
};

export const findDuplicateSnapshotsPageInternal = internalQuery({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    carry: v.optional(DuplicateSnapshotCarry),
  },
  returns: v.object({
    duplicates: v.array(
      v.object({
        datasetKey: v.string(),
        regionCode: v.string(),
        asOfDate: v.string(),
        count: v.number(),
        ids: v.array(v.id("snapshots")),
      }),
    ),
    nextCursor: v.union(v.string(), v.null()),
    carry: v.union(DuplicateSnapshotCarry, v.null()),
  }),
  handler: async (ctx, args) => findDuplicateSnapshotsPageInternalImpl(ctx, args),
});

export const findDuplicateAssetsPageInternal = internalQuery({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    carry: v.optional(DuplicateAssetCarry),
  },
  returns: v.object({
    duplicates: v.array(
      v.object({
        assetKey: v.string(),
        count: v.number(),
        ids: v.array(v.id("assets")),
      }),
    ),
    nextCursor: v.union(v.string(), v.null()),
    carry: v.union(DuplicateAssetCarry, v.null()),
  }),
  handler: async (ctx, args) => findDuplicateAssetsPageInternalImpl(ctx, args),
});

const DuplicateScanKey = "default";
const DuplicateScanSampleLimit = 25;
const DuplicateGroupInsertBatch = 200;
const DuplicateCleanupKey = "default";
const DuplicateCleanupGroupLimit = 1;
const DuplicateCleanupDeleteLimit = 500;

const pickSnapshotKeepId = (
  snapshots: Array<{
    _id: Id<"snapshots">;
    activeBuildId?: string;
    pendingBuildId?: string;
    downloadedAt?: number;
    parsedAt?: number;
    _creationTime: number;
  }>,
) => {
  if (snapshots.length === 0) {
    return null;
  }
  const score = (snapshot: typeof snapshots[number]) => [
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
  return best._id;
};

const pickAssetKeepId = (
  assets: Array<{
    _id: Id<"assets">;
    resolved: boolean;
    discoveredAt?: number;
    _creationTime: number;
  }>,
) => {
  if (assets.length === 0) {
    return null;
  }
  const score = (asset: typeof assets[number]) => [
    asset.resolved ? 1 : 0,
    asset.discoveredAt ?? 0,
    asset._creationTime,
  ];
  let best = assets[0];
  let bestScore = score(best);
  for (let i = 1; i < assets.length; i += 1) {
    const candidate = assets[i];
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
  return best._id;
};

export const getDuplicateScanState = query({
  args: { syncToken: v.optional(v.string()) },
  returns: v.union(
    v.object({
      _id: v.id("duplicateScanState"),
      _creationTime: v.number(),
      key: v.string(),
      status: v.string(),
      phase: v.string(),
      pageLimit: v.number(),

      runId: v.optional(v.string()),
      snapshotCursor: v.optional(v.string()),
      snapshotCarry: v.optional(DuplicateSnapshotCarry),
      assetCursor: v.optional(v.string()),
      assetCarry: v.optional(DuplicateAssetCarry),
      snapshotPagesScanned: v.number(),
      assetPagesScanned: v.number(),
      snapshotDuplicateGroups: v.number(),
      assetDuplicateGroups: v.number(),
      snapshotSample: v.optional(DuplicateScanSampleSnapshots),
      assetSample: v.optional(DuplicateScanSampleAssets),
      startedAt: v.number(),
      updatedAt: v.number(),
      finishedAt: v.optional(v.number()),
      error: v.optional(v.string()),
      inFlightUntil: v.optional(v.number()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    return await ctx.db
      .query("duplicateScanState")
      .withIndex("by_key", (q) => q.eq("key", DuplicateScanKey))
      .unique();
  },
});

export const listDuplicateSnapshotGroups = query({
  args: {
    syncToken: v.optional(v.string()),
    scanId: v.id("duplicateScanState"),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    groups: v.array(
      v.object({
        _id: v.id("duplicateSnapshotGroups"),
        scanId: v.id("duplicateScanState"),
        datasetKey: v.string(),
        regionCode: v.string(),
        asOfDate: v.string(),
        count: v.number(),
        ids: v.array(v.id("snapshots")),
        createdAt: v.number(),
      }),
    ),
    nextCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const limit = normalizePageLimit(args.limit, 200);
    const result = await ctx.db
      .query("duplicateSnapshotGroups")
      .withIndex("by_scanId", (q) => q.eq("scanId", args.scanId))
      .paginate({ cursor: args.cursor ?? null, numItems: limit });
    return {
      groups: result.page,
      nextCursor: result.continueCursor ?? null,
    };
  },
});

export const listDuplicateAssetGroups = query({
  args: {
    syncToken: v.optional(v.string()),
    scanId: v.id("duplicateScanState"),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    groups: v.array(
      v.object({
        _id: v.id("duplicateAssetGroups"),
        scanId: v.id("duplicateScanState"),
        assetKey: v.string(),
        count: v.number(),
        ids: v.array(v.id("assets")),
        createdAt: v.number(),
      }),
    ),
    nextCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const limit = normalizePageLimit(args.limit, 200);
    const result = await ctx.db
      .query("duplicateAssetGroups")
      .withIndex("by_scanId", (q) => q.eq("scanId", args.scanId))
      .paginate({ cursor: args.cursor ?? null, numItems: limit });
    return {
      groups: result.page,
      nextCursor: result.continueCursor ?? null,
    };
  },
});

export const listDuplicateSnapshotGroupsPageInternal = internalQuery({
  args: {
    scanId: v.id("duplicateScanState"),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    groups: v.array(
      v.object({
        _id: v.id("duplicateSnapshotGroups"),
        scanId: v.id("duplicateScanState"),
        datasetKey: v.string(),
        regionCode: v.string(),
        asOfDate: v.string(),
        count: v.number(),
        ids: v.array(v.id("snapshots")),
        createdAt: v.number(),
      }),
    ),
    nextCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const limit = normalizePageLimit(args.limit, DuplicateCleanupGroupLimit);
    const result = await ctx.db
      .query("duplicateSnapshotGroups")
      .withIndex("by_scanId", (q) => q.eq("scanId", args.scanId))
      .paginate({ cursor: args.cursor ?? null, numItems: limit });
    return {
      groups: result.page,
      nextCursor: result.continueCursor ?? null,
    };
  },
});

export const listDuplicateAssetGroupsPageInternal = internalQuery({
  args: {
    scanId: v.id("duplicateScanState"),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    groups: v.array(
      v.object({
        _id: v.id("duplicateAssetGroups"),
        scanId: v.id("duplicateScanState"),
        assetKey: v.string(),
        count: v.number(),
        ids: v.array(v.id("assets")),
        createdAt: v.number(),
      }),
    ),
    nextCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const limit = normalizePageLimit(args.limit, DuplicateCleanupGroupLimit);
    const result = await ctx.db
      .query("duplicateAssetGroups")
      .withIndex("by_scanId", (q) => q.eq("scanId", args.scanId))
      .paginate({ cursor: args.cursor ?? null, numItems: limit });
    return {
      groups: result.page,
      nextCursor: result.continueCursor ?? null,
    };
  },
});

export const getSnapshotsByIdsInternal = internalQuery({
  args: { ids: v.array(v.id("snapshots")) },
  returns: v.array(
    v.union(
      v.object({
        _id: v.id("snapshots"),
        _creationTime: v.number(),
        activeBuildId: v.optional(v.string()),
        pendingBuildId: v.optional(v.string()),
        downloadedAt: v.number(),
        parsedAt: v.number(),
      }),
      v.null(),
    ),
  ),
  handler: async (ctx, args) => {
    const out: Array<{
      _id: Id<"snapshots">;
      _creationTime: number;
      activeBuildId?: string;
      pendingBuildId?: string;
      downloadedAt: number;
      parsedAt: number;
    } | null> = [];
    for (const id of args.ids) {
      const snapshot = await ctx.db.get(id);
      if (!snapshot) {
        out.push(null);
        continue;
      }
      out.push({
        _id: snapshot._id,
        _creationTime: snapshot._creationTime,
        activeBuildId: snapshot.activeBuildId,
        pendingBuildId: snapshot.pendingBuildId,
        downloadedAt: snapshot.downloadedAt,
        parsedAt: snapshot.parsedAt,
      });
    }
    return out;
  },
});

export const getAssetsByIdsInternal = internalQuery({
  args: { ids: v.array(v.id("assets")) },
  returns: v.array(
    v.union(
      v.object({
        _id: v.id("assets"),
        _creationTime: v.number(),
        resolved: v.boolean(),
        discoveredAt: v.number(),
      }),
      v.null(),
    ),
  ),
  handler: async (ctx, args) => {
    const out: Array<{
      _id: Id<"assets">;
      _creationTime: number;
      resolved: boolean;
      discoveredAt: number;
    } | null> = [];
    for (const id of args.ids) {
      const asset = await ctx.db.get(id);
      if (!asset) {
        out.push(null);
        continue;
      }
      out.push({
        _id: asset._id,
        _creationTime: asset._creationTime,
        resolved: asset.resolved,
        discoveredAt: asset.discoveredAt,
      });
    }
    return out;
  },
});

export const startDuplicateScan = mutation({
  args: {
    syncToken: v.optional(v.string()),
    pageLimit: v.optional(v.number()),
  },
  returns: v.id("duplicateScanState"),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const pageLimit = normalizePageLimit(args.pageLimit, 1000);
    const existing = await ctx.db
      .query("duplicateScanState")
      .withIndex("by_key", (q) => q.eq("key", DuplicateScanKey))
      .unique();

    if (existing && existing.status === "running") {
      throw new ConvexError({
        code: "CONFLICT",
        message: "Duplicate scan already running",
      });
    }

    const now = Date.now();
    const runId = makeDuplicateScanRunId();
    const payload: {
      key: string;
      status: "running";
      phase: "snapshots";
      pageLimit: number;

      runId: string;

      snapshotCursor?: string;
      snapshotCarry?: { datasetKey: string; regionCode: string; asOfDate: string; ids: Array<Id<"snapshots">> };
      assetCursor?: string;
      assetCarry?: { assetKey: string; ids: Array<Id<"assets">> };
      snapshotPagesScanned: number;
      assetPagesScanned: number;
      snapshotDuplicateGroups: number;
      assetDuplicateGroups: number;
      snapshotSample: Array<{
        datasetKey: string;
        regionCode: string;
        asOfDate: string;
        count: number;
        ids: Array<Id<"snapshots">>;
      }>;
      assetSample: Array<{
        assetKey: string;
        count: number;
        ids: Array<Id<"assets">>;
      }>;
      startedAt: number;
      updatedAt: number;
      finishedAt?: number;
      error?: string;
      inFlightUntil?: number;
    } = {
      key: DuplicateScanKey,
      status: "running",
      phase: "snapshots",
      pageLimit,

      runId,

      snapshotCursor: undefined,
      snapshotCarry: undefined,
      assetCursor: undefined,
      assetCarry: undefined,
      snapshotPagesScanned: 0,
      assetPagesScanned: 0,
      snapshotDuplicateGroups: 0,
      assetDuplicateGroups: 0,
      snapshotSample: [],
      assetSample: [],
      startedAt: now,
      updatedAt: now,
      finishedAt: undefined,
      error: undefined,
      inFlightUntil: undefined,
    };

    const stateId = existing
      ? (await ctx.db.patch(existing._id, payload), existing._id)
      : await ctx.db.insert("duplicateScanState", payload);

    if (existing) {
      await ctx.scheduler.runAfter(0, internal.maintenance.resetDuplicateScanAndStartInternal, {
        stateId,
        runId,
      });
      return stateId;
    }

    await ctx.scheduler.runAfter(0, internal.maintenance.runDuplicateScanChunk, {
      stateId,
      runId,
    });

    return stateId;
  },
});

export const stopDuplicateScan = mutation({
  args: { syncToken: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const existing = await ctx.db
      .query("duplicateScanState")
      .withIndex("by_key", (q) => q.eq("key", DuplicateScanKey))
      .unique();
    if (!existing) {
      return null;
    }
    await ctx.db.patch(existing._id, {
      status: "stopped",
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const getDuplicateCleanupState = query({
  args: { syncToken: v.optional(v.string()) },
  returns: v.union(
    v.object({
      _id: v.id("duplicateCleanupState"),
      _creationTime: v.number(),
      key: v.string(),
      status: v.string(),
      phase: v.string(),
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
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    return await ctx.db
      .query("duplicateCleanupState")
      .withIndex("by_key", (q) => q.eq("key", DuplicateCleanupKey))
      .unique();
  },
});

export const startDuplicateCleanup = mutation({
  args: {
    syncToken: v.optional(v.string()),
    scanId: v.optional(v.id("duplicateScanState")),
    dryRun: v.optional(v.boolean()),
    pageLimit: v.optional(v.number()),
  },
  returns: v.id("duplicateCleanupState"),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const pageLimit = normalizePageLimit(args.pageLimit, DuplicateCleanupDeleteLimit);
    const dryRun = args.dryRun ?? true;

    const scan =
      args.scanId ??
      (await ctx.db
        .query("duplicateScanState")
        .withIndex("by_key", (q) => q.eq("key", DuplicateScanKey))
        .unique())?._id;
    if (!scan) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Duplicate scan not found",
      });
    }
    const scanDoc = await ctx.db.get(scan);
    if (!scanDoc) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Duplicate scan not found",
      });
    }
    if (scanDoc.status !== "complete") {
      throw new ConvexError({
        code: "CONFLICT",
        message: "Duplicate scan must be complete before cleanup",
      });
    }

    const existing = await ctx.db
      .query("duplicateCleanupState")
      .withIndex("by_key", (q) => q.eq("key", DuplicateCleanupKey))
      .unique();

    if (existing && existing.status === "running") {
      throw new ConvexError({
        code: "CONFLICT",
        message: "Duplicate cleanup already running",
      });
    }

    const now = Date.now();
    const payload: {
      key: string;
      status: "running";
      phase: "snapshots";
      scanId: Id<"duplicateScanState">;
      dryRun: boolean;
      pageLimit: number;
      groupCursor?: string;
      currentSnapshotGroupId?: Id<"duplicateSnapshotGroups">;
      snapshotDeleteIds?: Array<Id<"snapshots">>;
      currentSnapshotId?: Id<"snapshots">;
      snapshotDeleteCursor?: string;
      currentAssetGroupId?: Id<"duplicateAssetGroups">;
      assetDeleteIds?: Array<Id<"assets">>;
      assetDeleteIndex?: number;
      snapshotGroupsProcessed: number;
      snapshotsDeleted: number;
      tableRowsDeleted: number;
      assetGroupsProcessed: number;
      assetsDeleted: number;
      startedAt: number;
      updatedAt: number;
      finishedAt?: number;
      error?: string;
      inFlightUntil?: number;
    } = {
      key: DuplicateCleanupKey,
      status: "running",
      phase: "snapshots",
      scanId: scanDoc._id,
      dryRun,
      pageLimit,
      groupCursor: undefined,
      currentSnapshotGroupId: undefined,
      snapshotDeleteIds: undefined,
      currentSnapshotId: undefined,
      snapshotDeleteCursor: undefined,
      currentAssetGroupId: undefined,
      assetDeleteIds: undefined,
      assetDeleteIndex: undefined,
      snapshotGroupsProcessed: 0,
      snapshotsDeleted: 0,
      tableRowsDeleted: 0,
      assetGroupsProcessed: 0,
      assetsDeleted: 0,
      startedAt: now,
      updatedAt: now,
      finishedAt: undefined,
      error: undefined,
      inFlightUntil: undefined,
    };

    const stateId = existing
      ? (await ctx.db.patch(existing._id, payload), existing._id)
      : await ctx.db.insert("duplicateCleanupState", payload);

    await ctx.scheduler.runAfter(0, internal.maintenance.runDuplicateCleanupChunk, {
      stateId,
    });

    return stateId;
  },
});

export const stopDuplicateCleanup = mutation({
  args: { syncToken: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const existing = await ctx.db
      .query("duplicateCleanupState")
      .withIndex("by_key", (q) => q.eq("key", DuplicateCleanupKey))
      .unique();
    if (!existing) {
      return null;
    }
    await ctx.db.patch(existing._id, {
      status: "stopped",
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const getDuplicateCleanupStateInternal = internalQuery({
  args: { stateId: v.id("duplicateCleanupState") },
  returns: v.union(
    v.object({
      _id: v.id("duplicateCleanupState"),
      _creationTime: v.number(),
      key: v.string(),
      status: v.string(),
      phase: v.string(),
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
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.stateId);
  },
});

export const updateDuplicateCleanupStateInternal = internalMutation({
  args: {
    stateId: v.id("duplicateCleanupState"),
    patch: v.any(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.stateId, { ...args.patch, updatedAt: Date.now() });
    return null;
  },
});

export const tryAcquireDuplicateCleanupLockInternal = internalMutation({
  args: { stateId: v.id("duplicateCleanupState") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const state = await ctx.db.get(args.stateId);
    if (!state || state.status !== "running") {
      return false;
    }
    const now = Date.now();
    if (state.inFlightUntil && state.inFlightUntil > now) {
      return false;
    }
    await ctx.db.patch(state._id, {
      inFlightUntil: now + 60_000,
      updatedAt: now,
    });
    return true;
  },
});

export const releaseDuplicateCleanupLockInternal = internalMutation({
  args: { stateId: v.id("duplicateCleanupState") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.stateId, {
      inFlightUntil: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const getDuplicateScanStateInternal = internalQuery({
  args: { stateId: v.id("duplicateScanState") },
  returns: v.union(
    v.object({
      _id: v.id("duplicateScanState"),
      _creationTime: v.number(),
      key: v.string(),
      status: v.string(),
      phase: v.string(),
      pageLimit: v.number(),

      runId: v.optional(v.string()),
      snapshotCursor: v.optional(v.string()),
      snapshotCarry: v.optional(DuplicateSnapshotCarry),
      assetCursor: v.optional(v.string()),
      assetCarry: v.optional(DuplicateAssetCarry),
      snapshotPagesScanned: v.number(),
      assetPagesScanned: v.number(),
      snapshotDuplicateGroups: v.number(),
      assetDuplicateGroups: v.number(),
      snapshotSample: v.optional(DuplicateScanSampleSnapshots),
      assetSample: v.optional(DuplicateScanSampleAssets),
      startedAt: v.number(),
      updatedAt: v.number(),
      finishedAt: v.optional(v.number()),
      error: v.optional(v.string()),
      inFlightUntil: v.optional(v.number()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.stateId);
  },
});

export const updateDuplicateScanStateInternal = internalMutation({
  args: {
    stateId: v.id("duplicateScanState"),
    patch: v.any(),

    // Optional: if provided and the state has a runId, only patch when it matches.
    runId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await ctx.db.get(args.stateId);
    if (!state) {
      return null;
    }
    if (state.runId && args.runId !== state.runId) {
      return null;
    }
    await ctx.db.patch(args.stateId, { ...args.patch, updatedAt: Date.now() });
    return null;
  },
});

export const clearDuplicateGroupsForScanInternal = internalMutation({
  args: {
    scanId: v.id("duplicateScanState"),
    runId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await ctx.db.get(args.scanId);
    if (!state) {
      return null;
    }
    if (state.runId && args.runId !== state.runId) {
      return null;
    }
    while (true) {
      const snap = await ctx.db
        .query("duplicateSnapshotGroups")
        .withIndex("by_scanId", (q) => q.eq("scanId", args.scanId))
        .take(1000);
      if (snap.length === 0) {
        break;
      }
      for (const doc of snap) {
        await ctx.db.delete(doc._id);
      }
    }
    while (true) {
      const assets = await ctx.db
        .query("duplicateAssetGroups")
        .withIndex("by_scanId", (q) => q.eq("scanId", args.scanId))
        .take(1000);
      if (assets.length === 0) {
        break;
      }
      for (const doc of assets) {
        await ctx.db.delete(doc._id);
      }
    }
    return null;
  },
});

export const insertSnapshotGroupsInternal = internalMutation({
  args: {
    scanId: v.id("duplicateScanState"),
    runId: v.optional(v.string()),
    groups: v.array(
      v.object({
        datasetKey: v.string(),
        regionCode: v.string(),
        asOfDate: v.string(),
        count: v.number(),
        ids: v.array(v.id("snapshots")),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await ctx.db.get(args.scanId);
    if (!state) {
      return null;
    }
    if (state.runId && args.runId !== state.runId) {
      return null;
    }
    const now = Date.now();
    for (const group of args.groups) {
      await ctx.db.insert("duplicateSnapshotGroups", {
        scanId: args.scanId,
        datasetKey: group.datasetKey,
        regionCode: group.regionCode,
        asOfDate: group.asOfDate,
        count: group.count,
        ids: group.ids,
        createdAt: now,
      });
    }
    return null;
  },
});

export const insertAssetGroupsInternal = internalMutation({
  args: {
    scanId: v.id("duplicateScanState"),
    runId: v.optional(v.string()),
    groups: v.array(
      v.object({
        assetKey: v.string(),
        count: v.number(),
        ids: v.array(v.id("assets")),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await ctx.db.get(args.scanId);
    if (!state) {
      return null;
    }
    if (state.runId && args.runId !== state.runId) {
      return null;
    }
    const now = Date.now();
    for (const group of args.groups) {
      await ctx.db.insert("duplicateAssetGroups", {
        scanId: args.scanId,
        assetKey: group.assetKey,
        count: group.count,
        ids: group.ids,
        createdAt: now,
      });
    }
    return null;
  },
});

export const tryAcquireDuplicateScanLockInternal = internalMutation({
  args: {
    stateId: v.id("duplicateScanState"),
    runId: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const state = await ctx.db.get(args.stateId);
    if (!state || state.status !== "running") {
      return false;
    }
    if (state.runId && args.runId !== state.runId) {
      return false;
    }
    const now = Date.now();
    if (state.inFlightUntil && state.inFlightUntil > now) {
      return false;
    }
    await ctx.db.patch(state._id, {
      inFlightUntil: now + 60_000,
      updatedAt: now,
    });
    return true;
  },
});

export const releaseDuplicateScanLockInternal = internalMutation({
  args: {
    stateId: v.id("duplicateScanState"),
    runId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await ctx.db.get(args.stateId);
    if (!state) {
      return null;
    }
    if (state.runId && args.runId !== state.runId) {
      return null;
    }
    await ctx.db.patch(args.stateId, {
      inFlightUntil: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const resetDuplicateScanAndStartInternal = internalAction({
  args: {
    stateId: v.id("duplicateScanState"),
    runId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await ctx.runQuery(internal.maintenance.getDuplicateScanStateInternal, {
      stateId: args.stateId,
    });
    if (!state || state.status !== "running") {
      return null;
    }
    if (state.runId && state.runId !== args.runId) {
      return null;
    }

    await ctx.runMutation(internal.maintenance.clearDuplicateGroupsForScanInternal, {
      scanId: args.stateId,
      runId: args.runId,
    });

    await ctx.scheduler.runAfter(0, internal.maintenance.runDuplicateScanChunk, {
      stateId: args.stateId,
      runId: args.runId,
    });

    return null;
  },
});

export const deleteSnapshotByIdInternal = internalMutation({
  args: { snapshotId: v.id("snapshots") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.snapshotId);
    return null;
  },
});

export const deleteAssetByIdInternal = internalMutation({
  args: { assetId: v.id("assets") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.assetId);
    return null;
  },
});

export const deleteSnapshotGroupByIdInternal = internalMutation({
  args: { groupId: v.id("duplicateSnapshotGroups") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.groupId);
    return null;
  },
});

export const deleteAssetGroupByIdInternal = internalMutation({
  args: { groupId: v.id("duplicateAssetGroups") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.groupId);
    return null;
  },
});

export const deleteTableDataBySnapshotPageInternal = internalMutation({
  args: {
    snapshotId: v.id("snapshots"),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    deleted: v.number(),
    nextCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const limit = normalizePageLimit(args.limit, DuplicateCleanupDeleteLimit);
    const result = await ctx.db
      .query("tableData")
      .withIndex("by_snapshot_build_rowIndex", (q) =>
        q.eq("snapshotId", args.snapshotId),
      )
      .paginate({ cursor: args.cursor ?? null, numItems: limit });

    let deleted = 0;
    for (const row of result.page) {
      await ctx.db.delete(row._id);
      deleted += 1;
    }

    return {
      deleted,
      nextCursor: result.continueCursor ?? null,
    };
  },
});

export const runDuplicateScanChunk = internalAction({
  args: {
    stateId: v.id("duplicateScanState"),
    runId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    let acquired = false;
    try {
      const locked = await ctx.runMutation(
        internal.maintenance.tryAcquireDuplicateScanLockInternal,
        { stateId: args.stateId, runId: args.runId },
      );
      acquired = locked;
      if (!locked) {
        return null;
      }
      const state = await ctx.runQuery(internal.maintenance.getDuplicateScanStateInternal, {
        stateId: args.stateId,
      });
      if (!state || state.status !== "running") {
        return null;
      }

      // Back-compat: legacy scans have no runId; once runId is present, ignore stale jobs.
      if (state.runId && args.runId !== state.runId) {
        return null;
      }
      const effectiveRunId = state.runId ?? args.runId;

      const pageLimit = normalizePageLimit(state.pageLimit, 1000);
      const now = Date.now();

      if (state.phase === "snapshots") {
        const snapshotArgs: {
          cursor?: string;
          limit?: number;
          carry?: { datasetKey: string; regionCode: string; asOfDate: string; ids: Array<Id<"snapshots">> };
        } = { limit: pageLimit };
        if (state.snapshotCursor) snapshotArgs.cursor = state.snapshotCursor;
        if (state.snapshotCarry) snapshotArgs.carry = state.snapshotCarry;

        const res = await ctx.runQuery(
          internal.maintenance.findDuplicateSnapshotsPageInternal,
          snapshotArgs,
        );

        if (res.duplicates.length > 0) {
          for (let i = 0; i < res.duplicates.length; i += DuplicateGroupInsertBatch) {
            await ctx.runMutation(internal.maintenance.insertSnapshotGroupsInternal, {
              scanId: state._id,
              runId: effectiveRunId,
              groups: res.duplicates.slice(i, i + DuplicateGroupInsertBatch),
            });
          }
        }

        const snapshotSample = (state.snapshotSample ?? []).slice();
        for (const dup of res.duplicates) {
          if (snapshotSample.length >= DuplicateScanSampleLimit) break;
          snapshotSample.push(dup);
        }

        const nextCursor = res.nextCursor ?? null;
        const patch: Record<string, unknown> = {
          snapshotCursor: nextCursor ?? undefined,
          snapshotCarry: res.carry ?? undefined,
          snapshotPagesScanned: state.snapshotPagesScanned + 1,
          snapshotDuplicateGroups: state.snapshotDuplicateGroups + res.duplicates.length,
          snapshotSample,
        };

        if (!nextCursor) {
          patch.phase = "assets";
        }

        await ctx.runMutation(internal.maintenance.updateDuplicateScanStateInternal, {
          stateId: state._id,
          patch,
          runId: effectiveRunId,
        });
      } else {
        const assetArgs: {
          cursor?: string;
          limit?: number;
          carry?: { assetKey: string; ids: Array<Id<"assets">> };
        } = { limit: pageLimit };
        if (state.assetCursor) assetArgs.cursor = state.assetCursor;
        if (state.assetCarry) assetArgs.carry = state.assetCarry;

        const res = await ctx.runQuery(
          internal.maintenance.findDuplicateAssetsPageInternal,
          assetArgs,
        );

        if (res.duplicates.length > 0) {
          for (let i = 0; i < res.duplicates.length; i += DuplicateGroupInsertBatch) {
            await ctx.runMutation(internal.maintenance.insertAssetGroupsInternal, {
              scanId: state._id,
              runId: effectiveRunId,
              groups: res.duplicates.slice(i, i + DuplicateGroupInsertBatch),
            });
          }
        }

        const assetSample = (state.assetSample ?? []).slice();
        for (const dup of res.duplicates) {
          if (assetSample.length >= DuplicateScanSampleLimit) break;
          assetSample.push(dup);
        }

        const nextCursor = res.nextCursor ?? null;
        const patch: Record<string, unknown> = {
          assetCursor: nextCursor ?? undefined,
          assetCarry: res.carry ?? undefined,
          assetPagesScanned: state.assetPagesScanned + 1,
          assetDuplicateGroups: state.assetDuplicateGroups + res.duplicates.length,
          assetSample,
        };

        if (!nextCursor) {
          patch.status = "complete";
          patch.finishedAt = now;
        }

        await ctx.runMutation(internal.maintenance.updateDuplicateScanStateInternal, {
          stateId: state._id,
          patch,
          runId: effectiveRunId,
        });
      }

      const refreshed = await ctx.runQuery(internal.maintenance.getDuplicateScanStateInternal, {
        stateId: state._id,
      });
      if (refreshed && refreshed.status === "running") {
        await ctx.scheduler.runAfter(0, internal.maintenance.runDuplicateScanChunk, {
          stateId: state._id,
          runId: effectiveRunId,
        });
      }

      return null;
    } catch (error) {
      await ctx.runMutation(internal.maintenance.updateDuplicateScanStateInternal, {
        stateId: args.stateId,
        patch: {
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        },
        runId: args.runId,
      });
      return null;
    } finally {
      if (acquired) {
        await ctx.runMutation(internal.maintenance.releaseDuplicateScanLockInternal, {
          stateId: args.stateId,
          runId: args.runId,
        });
      }
    }
  },
});

export const runDuplicateCleanupChunk = internalAction({
  args: { stateId: v.id("duplicateCleanupState") },
  returns: v.null(),
  handler: async (ctx, args) => {
    let acquired = false;
    try {
      const locked = await ctx.runMutation(
        internal.maintenance.tryAcquireDuplicateCleanupLockInternal,
        { stateId: args.stateId },
      );
      acquired = locked;
      if (!locked) {
        return null;
      }
      const state = await ctx.runQuery(internal.maintenance.getDuplicateCleanupStateInternal, {
        stateId: args.stateId,
      });
      if (!state || state.status !== "running") {
        return null;
      }

      const deleteLimit = normalizePageLimit(state.pageLimit, DuplicateCleanupDeleteLimit);
      const now = Date.now();
      const scheduleNextIfRunning = async () => {
        const refreshed = await ctx.runQuery(
          internal.maintenance.getDuplicateCleanupStateInternal,
          { stateId: state._id },
        );
        if (refreshed && refreshed.status === "running") {
          await ctx.scheduler.runAfter(0, internal.maintenance.runDuplicateCleanupChunk, {
            stateId: state._id,
          });
        }
      };

      if (state.phase === "snapshots") {
        if (state.currentSnapshotId) {
          if (!state.dryRun) {
            const res = await ctx.runMutation(
              internal.maintenance.deleteTableDataBySnapshotPageInternal,
              {
                snapshotId: state.currentSnapshotId,
                cursor: state.snapshotDeleteCursor,
                limit: deleteLimit,
              },
            );
            if (res.nextCursor) {
              await ctx.runMutation(internal.maintenance.updateDuplicateCleanupStateInternal, {
                stateId: state._id,
                patch: {
                  snapshotDeleteCursor: res.nextCursor,
                  tableRowsDeleted: state.tableRowsDeleted + res.deleted,
                },
              });
              await scheduleNextIfRunning();
              return null;
            }
            await ctx.runMutation(internal.maintenance.deleteSnapshotByIdInternal, {
              snapshotId: state.currentSnapshotId,
            });
            await ctx.runMutation(internal.maintenance.updateDuplicateCleanupStateInternal, {
              stateId: state._id,
              patch: {
                tableRowsDeleted: state.tableRowsDeleted + res.deleted,
              },
            });
          }

          const remaining = state.snapshotDeleteIds ?? [];
          const nextId = remaining[0];
          const rest = remaining.slice(1);
          if (nextId) {
            await ctx.runMutation(internal.maintenance.updateDuplicateCleanupStateInternal, {
              stateId: state._id,
              patch: {
                currentSnapshotId: nextId,
                snapshotDeleteIds: rest.length > 0 ? rest : undefined,
                snapshotDeleteCursor: undefined,
                snapshotsDeleted: state.snapshotsDeleted + 1,
              },
            });
            await scheduleNextIfRunning();
            return null;
          }

          if (!state.dryRun && state.currentSnapshotGroupId) {
            await ctx.runMutation(internal.maintenance.deleteSnapshotGroupByIdInternal, {
              groupId: state.currentSnapshotGroupId,
            });
          }

          await ctx.runMutation(internal.maintenance.updateDuplicateCleanupStateInternal, {
            stateId: state._id,
            patch: {
              currentSnapshotId: undefined,
              snapshotDeleteIds: undefined,
              snapshotDeleteCursor: undefined,
              currentSnapshotGroupId: undefined,
              snapshotsDeleted: state.snapshotsDeleted + 1,
              snapshotGroupsProcessed: state.snapshotGroupsProcessed + 1,
            },
          });
          await scheduleNextIfRunning();
          return null;
        }

        if (state.snapshotDeleteIds && state.snapshotDeleteIds.length > 0) {
          const [nextId, ...rest] = state.snapshotDeleteIds;
          await ctx.runMutation(internal.maintenance.updateDuplicateCleanupStateInternal, {
            stateId: state._id,
            patch: {
              currentSnapshotId: nextId,
              snapshotDeleteIds: rest.length > 0 ? rest : undefined,
              snapshotDeleteCursor: undefined,
            },
          });
          await scheduleNextIfRunning();
          return null;
        }

        const page = await ctx.runQuery(
          internal.maintenance.listDuplicateSnapshotGroupsPageInternal,
          {
            scanId: state.scanId,
            cursor: state.groupCursor,
            limit: DuplicateCleanupGroupLimit,
          },
        );

        if (page.groups.length === 0) {
          await ctx.runMutation(internal.maintenance.updateDuplicateCleanupStateInternal, {
            stateId: state._id,
            patch: {
              phase: "assets",
              groupCursor: undefined,
              currentSnapshotGroupId: undefined,
            },
          });
          await scheduleNextIfRunning();
          return null;
        }

        const group = page.groups[0];
        const snapshotDocs = await ctx.runQuery(
          internal.maintenance.getSnapshotsByIdsInternal,
          { ids: group.ids },
        );
        const snapshots = snapshotDocs.filter(
          (doc): doc is NonNullable<typeof doc> => doc !== null,
        );
        const keepId = pickSnapshotKeepId(snapshots);
        const deleteIds = keepId
          ? group.ids.filter((id) => id !== keepId)
          : [];

        if (deleteIds.length === 0) {
          if (!state.dryRun) {
            await ctx.runMutation(internal.maintenance.deleteSnapshotGroupByIdInternal, {
              groupId: group._id,
            });
          }
          await ctx.runMutation(internal.maintenance.updateDuplicateCleanupStateInternal, {
            stateId: state._id,
            patch: {
              groupCursor: page.nextCursor ?? undefined,
              snapshotGroupsProcessed: state.snapshotGroupsProcessed + 1,
            },
          });
          await scheduleNextIfRunning();
          return null;
        }

        if (state.dryRun) {
          await ctx.runMutation(internal.maintenance.updateDuplicateCleanupStateInternal, {
            stateId: state._id,
            patch: {
              groupCursor: page.nextCursor ?? undefined,
              snapshotGroupsProcessed: state.snapshotGroupsProcessed + 1,
              snapshotsDeleted: state.snapshotsDeleted + deleteIds.length,
            },
          });
          await scheduleNextIfRunning();
          return null;
        }

        const [firstId, ...rest] = deleteIds;
        await ctx.runMutation(internal.maintenance.updateDuplicateCleanupStateInternal, {
          stateId: state._id,
          patch: {
            groupCursor: page.nextCursor ?? undefined,
            currentSnapshotGroupId: group._id,
            currentSnapshotId: firstId,
            snapshotDeleteIds: rest.length > 0 ? rest : undefined,
            snapshotDeleteCursor: undefined,
          },
        });
        await scheduleNextIfRunning();
        return null;
      }

      if (state.currentAssetGroupId && state.assetDeleteIds) {
        if (!state.dryRun) {
          const startIndex = state.assetDeleteIndex ?? 0;
          const endIndex = Math.min(
            startIndex + deleteLimit,
            state.assetDeleteIds.length,
          );
          for (let i = startIndex; i < endIndex; i += 1) {
            await ctx.runMutation(internal.maintenance.deleteAssetByIdInternal, {
              assetId: state.assetDeleteIds[i],
            });
          }
          const deletedNow = endIndex - startIndex;
          if (endIndex < state.assetDeleteIds.length) {
            await ctx.runMutation(internal.maintenance.updateDuplicateCleanupStateInternal, {
              stateId: state._id,
              patch: {
                assetDeleteIndex: endIndex,
                assetsDeleted: state.assetsDeleted + deletedNow,
              },
            });
            await scheduleNextIfRunning();
            return null;
          }
          await ctx.runMutation(internal.maintenance.deleteAssetGroupByIdInternal, {
            groupId: state.currentAssetGroupId,
          });
          await ctx.runMutation(internal.maintenance.updateDuplicateCleanupStateInternal, {
            stateId: state._id,
            patch: {
              currentAssetGroupId: undefined,
              assetDeleteIds: undefined,
              assetDeleteIndex: undefined,
              assetGroupsProcessed: state.assetGroupsProcessed + 1,
              assetsDeleted: state.assetsDeleted + deletedNow,
            },
          });
          await scheduleNextIfRunning();
          return null;
        }
      }

      const assetPage = await ctx.runQuery(
        internal.maintenance.listDuplicateAssetGroupsPageInternal,
        {
          scanId: state.scanId,
          cursor: state.groupCursor,
          limit: DuplicateCleanupGroupLimit,
        },
      );

      if (assetPage.groups.length === 0) {
        await ctx.runMutation(internal.maintenance.updateDuplicateCleanupStateInternal, {
          stateId: state._id,
          patch: {
            status: "complete",
            finishedAt: now,
          },
        });
        await scheduleNextIfRunning();
        return null;
      }

      const assetGroup = assetPage.groups[0];
      const assetDocs = await ctx.runQuery(
        internal.maintenance.getAssetsByIdsInternal,
        { ids: assetGroup.ids },
      );
      const assets = assetDocs.filter(
        (doc): doc is NonNullable<typeof doc> => doc !== null,
      );
      const keepAssetId = pickAssetKeepId(assets);
      const assetDeleteIds = keepAssetId
        ? assetGroup.ids.filter((id) => id !== keepAssetId)
        : [];

      if (assetDeleteIds.length === 0) {
        if (!state.dryRun) {
          await ctx.runMutation(internal.maintenance.deleteAssetGroupByIdInternal, {
            groupId: assetGroup._id,
          });
        }
        await ctx.runMutation(internal.maintenance.updateDuplicateCleanupStateInternal, {
          stateId: state._id,
          patch: {
            groupCursor: assetPage.nextCursor ?? undefined,
            assetGroupsProcessed: state.assetGroupsProcessed + 1,
          },
        });
        await scheduleNextIfRunning();
        return null;
      }

      if (state.dryRun) {
        await ctx.runMutation(internal.maintenance.updateDuplicateCleanupStateInternal, {
          stateId: state._id,
          patch: {
            groupCursor: assetPage.nextCursor ?? undefined,
            assetGroupsProcessed: state.assetGroupsProcessed + 1,
            assetsDeleted: state.assetsDeleted + assetDeleteIds.length,
          },
        });
        await scheduleNextIfRunning();
        return null;
      }

      await ctx.runMutation(internal.maintenance.updateDuplicateCleanupStateInternal, {
        stateId: state._id,
        patch: {
          groupCursor: assetPage.nextCursor ?? undefined,
          currentAssetGroupId: assetGroup._id,
          assetDeleteIds,
          assetDeleteIndex: 0,
        },
      });

      await scheduleNextIfRunning();
      return null;
    } catch (error) {
      await ctx.runMutation(internal.maintenance.updateDuplicateCleanupStateInternal, {
        stateId: args.stateId,
        patch: {
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        },
      });
      return null;
    } finally {
      if (acquired) {
        await ctx.runMutation(internal.maintenance.releaseDuplicateCleanupLockInternal, {
          stateId: args.stateId,
        });
      }
    }
  },
});

export const runDuplicateScanOnce = mutation({
  args: { syncToken: v.optional(v.string()) },
  returns: v.union(
    v.object({
      _id: v.id("duplicateScanState"),
      _creationTime: v.number(),
      key: v.string(),
      status: v.string(),
      phase: v.string(),
      pageLimit: v.number(),

      runId: v.optional(v.string()),
      snapshotCursor: v.optional(v.string()),
      snapshotCarry: v.optional(DuplicateSnapshotCarry),
      assetCursor: v.optional(v.string()),
      assetCarry: v.optional(DuplicateAssetCarry),
      snapshotPagesScanned: v.number(),
      assetPagesScanned: v.number(),
      snapshotDuplicateGroups: v.number(),
      assetDuplicateGroups: v.number(),
      snapshotSample: v.optional(DuplicateScanSampleSnapshots),
      assetSample: v.optional(DuplicateScanSampleAssets),
      startedAt: v.number(),
      updatedAt: v.number(),
      finishedAt: v.optional(v.number()),
      error: v.optional(v.string()),
      inFlightUntil: v.optional(v.number()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const state = await ctx.db
      .query("duplicateScanState")
      .withIndex("by_key", (q) => q.eq("key", DuplicateScanKey))
      .unique();
    if (!state) {
      return null;
    }
    if (state.status !== "running") {
      return state;
    }
    await ctx.scheduler.runAfter(0, internal.maintenance.runDuplicateScanChunk, {
      stateId: state._id,
      runId: state.runId,
    });
    return await ctx.db.get(state._id);
  },
});

export const runDuplicateScanTick = mutation({
  args: { syncToken: v.optional(v.string()) },
  returns: v.union(
    v.object({
      _id: v.id("duplicateScanState"),
      _creationTime: v.number(),
      key: v.string(),
      status: v.string(),
      phase: v.string(),
      pageLimit: v.number(),

      runId: v.optional(v.string()),
      snapshotCursor: v.optional(v.string()),
      snapshotCarry: v.optional(DuplicateSnapshotCarry),
      assetCursor: v.optional(v.string()),
      assetCarry: v.optional(DuplicateAssetCarry),
      snapshotPagesScanned: v.number(),
      assetPagesScanned: v.number(),
      snapshotDuplicateGroups: v.number(),
      assetDuplicateGroups: v.number(),
      snapshotSample: v.optional(DuplicateScanSampleSnapshots),
      assetSample: v.optional(DuplicateScanSampleAssets),
      startedAt: v.number(),
      updatedAt: v.number(),
      finishedAt: v.optional(v.number()),
      error: v.optional(v.string()),
      inFlightUntil: v.optional(v.number()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const state = await ctx.db
      .query("duplicateScanState")
      .withIndex("by_key", (q) => q.eq("key", DuplicateScanKey))
      .unique();
    if (!state) {
      return null;
    }
    if (state.status !== "running") {
      return state;
    }

    const pageLimit = normalizePageLimit(state.pageLimit, 1000);
    const now = Date.now();

    if (state.phase === "snapshots") {
      const result = await ctx.db
        .query("snapshots")
        .withIndex("by_identity", (q) => q)
        .paginate({
          cursor: state.snapshotCursor ?? null,
          numItems: pageLimit,
        });

      const duplicates: Array<{
        datasetKey: string;
        regionCode: string;
        asOfDate: string;
        count: number;
        ids: Array<Id<"snapshots">>;
      }> = [];

      let current =
        state.snapshotCarry && state.snapshotCarry.ids.length > 0
          ? {
              datasetKey: state.snapshotCarry.datasetKey,
              regionCode: state.snapshotCarry.regionCode,
              asOfDate: state.snapshotCarry.asOfDate,
              ids: [...state.snapshotCarry.ids],
            }
          : null;

      const pushCurrentIfDuplicate = () => {
        if (current && current.ids.length > 1) {
          duplicates.push({
            datasetKey: current.datasetKey,
            regionCode: current.regionCode,
            asOfDate: current.asOfDate,
            count: current.ids.length,
            ids: current.ids,
          });
        }
      };

      for (const snapshot of result.page) {
        if (!current) {
          current = {
            datasetKey: snapshot.datasetKey,
            regionCode: snapshot.regionCode,
            asOfDate: snapshot.asOfDate,
            ids: [snapshot._id],
          };
          continue;
        }
        const sameIdentity =
          snapshot.datasetKey === current.datasetKey &&
          snapshot.regionCode === current.regionCode &&
          snapshot.asOfDate === current.asOfDate;
        if (sameIdentity) {
          current.ids.push(snapshot._id);
          continue;
        }
        pushCurrentIfDuplicate();
        current = {
          datasetKey: snapshot.datasetKey,
          regionCode: snapshot.regionCode,
          asOfDate: snapshot.asOfDate,
          ids: [snapshot._id],
        };
      }
      if (!result.continueCursor) {
        pushCurrentIfDuplicate();
      }

      if (duplicates.length > 0) {
        for (let i = 0; i < duplicates.length; i += DuplicateGroupInsertBatch) {
          for (const group of duplicates.slice(i, i + DuplicateGroupInsertBatch)) {
            await ctx.db.insert("duplicateSnapshotGroups", {
              scanId: state._id,
              datasetKey: group.datasetKey,
              regionCode: group.regionCode,
              asOfDate: group.asOfDate,
              count: group.count,
              ids: group.ids,
              createdAt: now,
            });
          }
        }
      }

      const snapshotSample = (state.snapshotSample ?? []).slice();
      for (const dup of duplicates) {
        if (snapshotSample.length >= DuplicateScanSampleLimit) break;
        snapshotSample.push(dup);
      }

      const nextCursor = result.continueCursor ?? null;
      const patch: Record<string, unknown> = {
        snapshotCursor: nextCursor ?? undefined,
        snapshotCarry: current ?? undefined,
        snapshotPagesScanned: state.snapshotPagesScanned + 1,
        snapshotDuplicateGroups: state.snapshotDuplicateGroups + duplicates.length,
        snapshotSample,
      };

      if (!nextCursor) {
        patch.phase = "assets";
      }

      await ctx.db.patch(state._id, { ...patch, updatedAt: now });
    } else {
      const result = await ctx.db
        .query("assets")
        .withIndex("by_assetKey", (q) => q)
        .paginate({
          cursor: state.assetCursor ?? null,
          numItems: pageLimit,
        });

      const duplicates: Array<{
        assetKey: string;
        count: number;
        ids: Array<Id<"assets">>;
      }> = [];

      let current =
        state.assetCarry && state.assetCarry.ids.length > 0
          ? { assetKey: state.assetCarry.assetKey, ids: [...state.assetCarry.ids] }
          : null;

      const pushCurrentIfDuplicate = () => {
        if (current && current.ids.length > 1) {
          duplicates.push({
            assetKey: current.assetKey,
            count: current.ids.length,
            ids: current.ids,
          });
        }
      };

      for (const asset of result.page) {
        if (!asset.assetKey) {
          continue;
        }
        if (current && asset.assetKey === current.assetKey) {
          current.ids.push(asset._id);
          continue;
        }
        pushCurrentIfDuplicate();
        current = { assetKey: asset.assetKey, ids: [asset._id] };
      }
      if (!result.continueCursor) {
        pushCurrentIfDuplicate();
      }

      if (duplicates.length > 0) {
        for (let i = 0; i < duplicates.length; i += DuplicateGroupInsertBatch) {
          for (const group of duplicates.slice(i, i + DuplicateGroupInsertBatch)) {
            await ctx.db.insert("duplicateAssetGroups", {
              scanId: state._id,
              assetKey: group.assetKey,
              count: group.count,
              ids: group.ids,
              createdAt: now,
            });
          }
        }
      }

      const assetSample = (state.assetSample ?? []).slice();
      for (const dup of duplicates) {
        if (assetSample.length >= DuplicateScanSampleLimit) break;
        assetSample.push(dup);
      }

      const nextCursor = result.continueCursor ?? null;
      const patch: Record<string, unknown> = {
        assetCursor: nextCursor ?? undefined,
        assetCarry: current ?? undefined,
        assetPagesScanned: state.assetPagesScanned + 1,
        assetDuplicateGroups: state.assetDuplicateGroups + duplicates.length,
        assetSample,
      };

      if (!nextCursor) {
        patch.status = "complete";
        patch.finishedAt = now;
      }

      await ctx.db.patch(state._id, { ...patch, updatedAt: now });
    }

    return await ctx.db.get(state._id);
  },
});
