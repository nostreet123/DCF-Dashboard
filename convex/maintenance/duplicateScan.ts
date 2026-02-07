import { internalAction, internalMutation, internalQuery, mutation, query } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { requireSyncToken } from "../syncAuth";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import {
  DuplicateAssetCarry,
  DuplicateCleanupGroupLimit,
  DuplicateGroupInsertBatch,
  DuplicateScanKey,
  DuplicateScanSampleAssets,
  DuplicateScanSampleLimit,
  DuplicateScanSampleSnapshots,
  DuplicateSnapshotCarry,
  makeDuplicateScanRunId,
  normalizePageLimit,
} from "./shared";

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
  args: {
    cursor?: string;
    limit?: number;
    carry?: { assetKey: string; ids: Array<Id<"assets">> };
  },
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

const DuplicateScanStateOrNull = v.union(
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
);

const scheduleDuplicateScanTick = async (ctx: any, args: { syncToken?: string }) => {
  requireSyncToken(args.syncToken);
  const state = await ctx.db
    .query("duplicateScanState")
    .withIndex("by_key", (q: any) => q.eq("key", DuplicateScanKey))
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
};

export const runDuplicateScanTick = mutation({
  args: { syncToken: v.optional(v.string()) },
  returns: DuplicateScanStateOrNull,
  handler: scheduleDuplicateScanTick,
});

// Deprecated alias for backward compatibility with callers that still use the old name.
export const runDuplicateScanOnce = mutation({
  args: { syncToken: v.optional(v.string()) },
  returns: DuplicateScanStateOrNull,
  handler: scheduleDuplicateScanTick,
});
