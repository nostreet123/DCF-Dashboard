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

export const append = mutation({
  args: {
    syncToken: v.optional(v.string()),
    syncLogId: v.id("syncLogs"),
    file: v.string(),
    stage: v.string(),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    await ctx.db.insert("syncErrors", {
      syncLogId: args.syncLogId,
      file: args.file,
      stage: args.stage,
      error: args.error,
      timestamp: Date.now(),
    });
  },
});

export const listBySyncLogId = query({
  args: {
    syncToken: v.optional(v.string()),
    syncLogId: v.id("syncLogs"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const DEFAULT_LIMIT = 200;
    const MAX_LIMIT = 1000;
    let limit = DEFAULT_LIMIT;
    if (args.limit !== undefined) {
      const requested = Number(args.limit);
      if (!Number.isInteger(requested) || requested <= 0) {
        throw new Error("Limit must be a positive integer");
      }
      limit = Math.min(requested, MAX_LIMIT);
    }
    return ctx.db
      .query("syncErrors")
      .withIndex("by_syncLogId_timestamp", (q) =>
        q.eq("syncLogId", args.syncLogId),
      )
      .order("desc")
      .take(limit);
  },
});
