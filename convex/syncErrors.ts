import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { requireSyncToken } from "./syncAuth";

const SyncStage = v.union(
  v.literal("discover"),
  v.literal("download"),
  v.literal("parse"),
  v.literal("transform"),
  v.literal("upload"),
);

const DebugLevel = v.union(
  v.literal("error"),
  v.literal("standard"),
  v.literal("verbose"),
);

export const append = mutation({
  args: {
    syncToken: v.optional(v.string()),
    syncLogId: v.id("syncLogs"),
    file: v.string(),
    stage: SyncStage,
    error: v.string(),
    correlationId: v.optional(v.string()),
    debugLevel: v.optional(DebugLevel),
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
      correlationId: args.correlationId,
      debugLevel: args.debugLevel,
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
      correlationId: v.optional(v.string()),
      debugLevel: v.optional(DebugLevel),
      eventId: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const DEFAULT_LIMIT = 200;
    const MAX_LIMIT = 1000;
    let limit = DEFAULT_LIMIT;
    if (args.limit !== undefined) {
      const requested = Number(args.limit);
      if (!Number.isInteger(requested) || requested <= 0) {
        throw new ConvexError({
          code: "BAD_REQUEST",
          message: "Limit must be a positive integer",
        });
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
