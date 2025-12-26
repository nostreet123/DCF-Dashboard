import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const requireSyncToken = (syncToken: string | null | undefined) => {
  const expected = process.env.DAMODARAN_SYNC_TOKEN;
  if (expected && syncToken !== expected) {
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
    const limit = args.limit ?? 200;
    return ctx.db
      .query("syncErrors")
      .withIndex("by_syncLogId_timestamp", (q) =>
        q.eq("syncLogId", args.syncLogId),
      )
      .order("desc")
      .take(limit);
  },
});
