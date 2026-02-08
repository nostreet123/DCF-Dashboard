import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { requireSyncToken } from "./syncAuth";

const SyncStatus = v.union(
  v.literal("running"),
  v.literal("success"),
  v.literal("partial"),
  v.literal("failed"),
);

const DebugLevel = v.union(
  v.literal("error"),
  v.literal("standard"),
  v.literal("verbose"),
);

const SyncLog = v.object({
  _id: v.id("syncLogs"),
  _creationTime: v.number(),
  syncType: v.string(),
  startedAt: v.number(),
  completedAt: v.optional(v.number()),
  status: SyncStatus,
  requestId: v.optional(v.string()),
  correlationId: v.optional(v.string()),
  debugLevel: v.optional(DebugLevel),
  assetsDiscovered: v.number(),
  assetsDownloaded: v.number(),
  assetsSkipped: v.number(),
  rowsInserted: v.number(),
  errorCount: v.number(),
  pageLastUpdated: v.optional(v.string()),
});

type SyncLogPick = {
  _id: Id<"syncLogs">;
  status: "running" | "success" | "partial" | "failed";
  completedAt?: number;
  startedAt: number;
  _creationTime: number;
};

const pickBestSyncLog = (logs: SyncLogPick[]) => {
  if (logs.length === 0) {
    return null;
  }
  const score = (log: SyncLogPick) => [
    log.completedAt ? 0 : 1,
    log.startedAt ?? 0,
    log._creationTime,
  ];
  let best = logs[0];
  let bestScore = score(best);
  for (let i = 1; i < logs.length; i += 1) {
    const candidate = logs[i];
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

export const create = mutation({
  args: {
    syncToken: v.optional(v.string()),
    syncType: v.string(),
    pageLastUpdated: v.optional(v.string()),
    requestId: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    debugLevel: v.optional(DebugLevel),
  },
  returns: v.id("syncLogs"),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);

    if (args.requestId) {
      const matches = await ctx.db
        .query("syncLogs")
        .withIndex("by_requestId", (q) => q.eq("requestId", args.requestId))
        .take(2);
      if (matches.length > 0) {
        if (matches.length === 1) {
          return matches[0]._id;
        }
        const allMatches = await ctx.db
          .query("syncLogs")
          .withIndex("by_requestId", (q) => q.eq("requestId", args.requestId))
          .collect();
        const existing = pickBestSyncLog(allMatches) ?? matches[0];
        return existing._id;
      }
    }

    const syncLogId = await ctx.db.insert("syncLogs", {
      syncType: args.syncType,
      startedAt: Date.now(),
      completedAt: undefined,
      status: "running",
      requestId: args.requestId,
      correlationId: args.correlationId,
      debugLevel: args.debugLevel,
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
    eventId: v.optional(v.string()),
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

    if (args.eventId !== undefined) {
      const eventId = args.eventId;
      const existingEvent = await ctx.db
        .query("syncLogIncrements")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .take(1);
      if (existingEvent.length > 0) {
        return null;
      }

      await ctx.db.insert("syncLogIncrements", {
        syncLogId: args.syncLogId,
        eventId,
        createdAt: Date.now(),
        delta: args.delta,
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
    const log = await ctx.db.get(args.syncLogId);
    if (!log) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Sync log not found",
      });
    }
    if (log.completedAt) {
      if (log.status === args.status) {
        return null;
      }
      throw new ConvexError({
        code: "CONFLICT",
        message: "Sync log already completed",
      });
    }
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
  returns: v.array(SyncLog),
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
