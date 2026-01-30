import { internalAction, internalMutation, internalQuery, mutation, query } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { requireSyncToken } from "../syncAuth";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import {
  DuplicateCleanupDeleteLimit,
  DuplicateCleanupGroupLimit,
  DuplicateCleanupKey,
  DuplicateScanKey,
  normalizePageLimit,
  pickAssetKeepId,
  pickSnapshotKeepId,
} from "./shared";

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
      .withIndex("by_snapshot_build_rowIndex", (q) => q.eq("snapshotId", args.snapshotId))
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
        const deleteIds = keepId ? group.ids.filter((id) => id !== keepId) : [];

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

