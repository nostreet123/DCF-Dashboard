import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { normalizePositiveIntegerLimit } from "./normalization";
import { requireSyncToken } from "./syncAuth";

const SyncStage = v.union(
  v.literal("discover"),
  v.literal("download"),
  v.literal("parse"),
  v.literal("transform"),
  v.literal("upload"),
);

export const append = mutation({
  args: {
    syncToken: v.optional(v.string()),
    syncLogId: v.id("syncLogs"),
    file: v.string(),
    stage: SyncStage,
    error: v.string(),
    eventId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    if (args.eventId) {
      const existing = await ctx.db
        .query("syncErrors")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .take(1);
      if (existing.length > 0) {
        return null;
      }
    }
    await ctx.db.insert("syncErrors", {
      syncLogId: args.syncLogId,
      file: args.file,
      stage: args.stage,
      error: args.error,
      timestamp: Date.now(),
      eventId: args.eventId,
    });
    return null;
  },
});

export const listBySyncLogId = query({
  args: {
    syncToken: v.optional(v.string()),
    syncLogId: v.id("syncLogs"),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("syncErrors"),
      _creationTime: v.number(),
      syncLogId: v.id("syncLogs"),
      file: v.string(),
      error: v.string(),
      timestamp: v.number(),
      stage: SyncStage,
      eventId: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const limit = normalizePositiveIntegerLimit(args.limit, 200, 1000);
    return ctx.db
      .query("syncErrors")
      .withIndex("by_syncLogId_timestamp", (q) =>
        q.eq("syncLogId", args.syncLogId),
      )
      .order("desc")
      .take(limit);
  },
});
