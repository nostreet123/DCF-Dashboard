import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { requireSyncToken } from "./syncAuth";

const SyncStatus = v.union(
  v.literal("running"),
  v.literal("success"),
  v.literal("partial"),
  v.literal("failed"),
);

const syncLogValidator = v.object({
  _id: v.id("syncLogs"),
  _creationTime: v.number(),
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
});

export const create = mutation({
  args: {
    syncToken: v.optional(v.string()),
    syncType: v.string(),
    pageLastUpdated: v.optional(v.string()),
  },
  returns: v.id("syncLogs"),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);

    const syncLogId = await ctx.db.insert("syncLogs", {
      syncType: args.syncType,
      startedAt: Date.now(),
      completedAt: undefined,
      status: "running",
      assetsDiscovered: 0,
      assetsDownloaded: 0,
      assetsSkipped: 0,
      rowsInserted: 0,
      errorCount: 0,
      pageLastUpdated: args.pageLastUpdated,
    });

    return syncLogId;
  },
});

export const increment = mutation({
  args: {
    syncToken: v.optional(v.string()),
    syncLogId: v.id("syncLogs"),
    delta: v.object({
      assetsDiscovered: v.optional(v.number()),
      assetsDownloaded: v.optional(v.number()),
      assetsSkipped: v.optional(v.number()),
      rowsInserted: v.optional(v.number()),
      errorCount: v.optional(v.number()),
    }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);

    const log = await ctx.db.get(args.syncLogId);
    if (!log) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Sync log not found",
      });
    }

    await ctx.db.patch(args.syncLogId, {
      assetsDiscovered: log.assetsDiscovered + (args.delta.assetsDiscovered ?? 0),
      assetsDownloaded: log.assetsDownloaded + (args.delta.assetsDownloaded ?? 0),
      assetsSkipped: log.assetsSkipped + (args.delta.assetsSkipped ?? 0),
      rowsInserted: log.rowsInserted + (args.delta.rowsInserted ?? 0),
      errorCount: log.errorCount + (args.delta.errorCount ?? 0),
    });
    return null;
  },
});

export const finish = mutation({
  args: {
    syncToken: v.optional(v.string()),
    syncLogId: v.id("syncLogs"),
    status: SyncStatus,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    await ctx.db.patch(args.syncLogId, {
      status: args.status,
      completedAt: Date.now(),
    });
    return null;
  },
});

export const listRecent = query({
  args: {
    syncToken: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(syncLogValidator),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const limit = args.limit ?? 20;
    return ctx.db
      .query("syncLogs")
      .withIndex("by_startedAt")
      .order("desc")
      .take(limit);
  },
});
