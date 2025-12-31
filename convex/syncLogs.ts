import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const requireSyncToken = (syncToken: string | undefined) => {
  const expected = process.env.DAMODARAN_SYNC_TOKEN;
  if (!expected) {
    throw new Error("Missing DAMODARAN_SYNC_TOKEN");
  }
  if (!syncToken || syncToken !== expected) {
    throw new Error("Invalid sync token");
  }
};

export const create = mutation({
  args: {
    syncToken: v.optional(v.string()),
    syncType: v.string(),
    pageLastUpdated: v.optional(v.string()),
  },
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
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);

    const log = await ctx.db.get(args.syncLogId);
    if (!log) {
      throw new Error("Sync log not found");
    }

    await ctx.db.patch(args.syncLogId, {
      assetsDiscovered: log.assetsDiscovered + (args.delta.assetsDiscovered ?? 0),
      assetsDownloaded: log.assetsDownloaded + (args.delta.assetsDownloaded ?? 0),
      assetsSkipped: log.assetsSkipped + (args.delta.assetsSkipped ?? 0),
      rowsInserted: log.rowsInserted + (args.delta.rowsInserted ?? 0),
      errorCount: log.errorCount + (args.delta.errorCount ?? 0),
    });
  },
});

export const finish = mutation({
  args: {
    syncToken: v.optional(v.string()),
    syncLogId: v.id("syncLogs"),
    status: v.union(
      v.literal("running"),
      v.literal("success"),
      v.literal("partial"),
      v.literal("failed"),
    ),
  },
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    await ctx.db.patch(args.syncLogId, {
      status: args.status,
      completedAt: Date.now(),
    });
  },
});

export const listRecent = query({
  args: {
    syncToken: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
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
