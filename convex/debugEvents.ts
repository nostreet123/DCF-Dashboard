import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { requireSyncToken } from "./syncAuth";

const DebugLevel = v.union(
  v.literal("error"),
  v.literal("standard"),
  v.literal("verbose"),
);

const DebugSource = v.union(
  v.literal("next_api"),
  v.literal("python_service"),
  v.literal("damodaran_sync"),
  v.literal("convex"),
);

const normalizeLimit = (requested: number | undefined, defaultLimit: number) => {
  if (requested === undefined) {
    return defaultLimit;
  }
  const limit = Number(requested);
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: "Limit must be a positive integer",
    });
  }
  return Math.min(limit, 500);
};

const runSummary = (run: any) => {
  const summary = { ...run };
  if ("trace" in summary) {
    delete summary.trace;
  }
  return summary;
};

export const append = mutation({
  args: {
    syncToken: v.optional(v.string()),
    correlationId: v.string(),
    source: DebugSource,
    route: v.optional(v.string()),
    level: DebugLevel,
    debugLevel: DebugLevel,
    eventType: v.string(),
    message: v.optional(v.string()),
    data: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    await ctx.db.insert("debugEvents", {
      correlationId: args.correlationId,
      createdAt: Date.now(),
      source: args.source,
      route: args.route,
      level: args.level,
      debugLevel: args.debugLevel,
      eventType: args.eventType,
      message: args.message,
      data: args.data,
    });
    return null;
  },
});

export const getTimeline = query({
  args: {
    syncToken: v.optional(v.string()),
    correlationId: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    correlationId: v.string(),
    events: v.array(
      v.object({
        timestamp: v.number(),
        source: v.string(),
        type: v.string(),
        level: v.optional(DebugLevel),
        eventType: v.optional(v.string()),
        message: v.optional(v.string()),
        data: v.optional(v.any()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const limit = normalizeLimit(args.limit, 100);
    const [debugEvents, syncLogs, syncErrors, valuationRuns] = await Promise.all([
      ctx.db
        .query("debugEvents")
        .withIndex("by_correlationId_createdAt", (q) =>
          q.eq("correlationId", args.correlationId),
        )
        .order("desc")
        .take(limit),
      ctx.db
        .query("syncLogs")
        .withIndex("by_correlationId_startedAt", (q) =>
          q.eq("correlationId", args.correlationId),
        )
        .order("desc")
        .take(limit),
      ctx.db
        .query("syncErrors")
        .withIndex("by_correlationId_timestamp", (q) =>
          q.eq("correlationId", args.correlationId),
        )
        .order("desc")
        .take(limit),
      ctx.db
        .query("valuationRuns")
        .withIndex("by_correlationId_createdAt", (q) =>
          q.eq("correlationId", args.correlationId),
        )
        .order("desc")
        .take(limit),
    ]);

    const timeline = [
      ...debugEvents.map((event) => ({
        timestamp: event.createdAt,
        source: event.source,
        type: "debug_event",
        level: event.level,
        eventType: event.eventType,
        message: event.message,
        data: event.data,
      })),
      ...syncLogs.map((log) => ({
        timestamp: log.startedAt,
        source: "damodaran_sync",
        type: "sync_log",
        level: log.debugLevel,
        message: `sync:${log.status}`,
        data: {
          syncLogId: log._id,
          syncType: log.syncType,
          status: log.status,
          assetsDiscovered: log.assetsDiscovered,
          assetsDownloaded: log.assetsDownloaded,
          assetsSkipped: log.assetsSkipped,
          rowsInserted: log.rowsInserted,
          errorCount: log.errorCount,
        },
      })),
      ...syncErrors.map((error) => ({
        timestamp: error.timestamp,
        source: "damodaran_sync",
        type: "sync_error",
        level: error.debugLevel ?? "error",
        message: error.error,
        data: {
          syncLogId: error.syncLogId,
          file: error.file,
          stage: error.stage,
        },
      })),
      ...valuationRuns.map((run) => ({
        timestamp: run.createdAt,
        source: "python_service",
        type: "valuation_run",
        level: run.debugLevel,
        message: run.status,
        data: {
          runId: run._id,
          status: run.status,
          symbol: run.symbol,
          primaryKeyNorm: run.primaryKeyNorm,
          regionCode: run.regionCode,
          asOfDate: run.asOfDate,
          traceStorage: run.traceStorage,
          error: run.error,
        },
      })),
    ].sort((a, b) => a.timestamp - b.timestamp);

    return {
      correlationId: args.correlationId,
      events: timeline.slice(Math.max(0, timeline.length - limit)),
    };
  },
});

export const listRecentFailures = query({
  args: {
    syncToken: v.optional(v.string()),
    limit: v.optional(v.number()),
    source: v.optional(DebugSource),
  },
  returns: v.array(
    v.object({
      _id: v.id("debugEvents"),
      _creationTime: v.number(),
      correlationId: v.string(),
      createdAt: v.number(),
      source: DebugSource,
      route: v.optional(v.string()),
      level: DebugLevel,
      debugLevel: DebugLevel,
      eventType: v.string(),
      message: v.optional(v.string()),
      data: v.optional(v.any()),
    }),
  ),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const limit = normalizeLimit(args.limit, 50);

    const source = args.source;
    if (source !== undefined) {
      return ctx.db
        .query("debugEvents")
        .withIndex("by_level_source_createdAt", (q) =>
          q.eq("level", "error").eq("source", source),
        )
        .order("desc")
        .take(limit);
    }

    return ctx.db
      .query("debugEvents")
      .withIndex("by_level_createdAt", (q) => q.eq("level", "error"))
      .order("desc")
      .take(limit);
  },
});

export const getRunDebug = query({
  args: {
    syncToken: v.optional(v.string()),
    runId: v.id("valuationRuns"),
    includeTrace: v.optional(v.boolean()),
    timelineLimit: v.optional(v.number()),
  },
  returns: v.union(
    v.null(),
    v.object({
      run: v.any(),
      trace: v.optional(v.any()),
      events: v.array(v.any()),
    }),
  ),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const timelineLimit = normalizeLimit(args.timelineLimit, 50);
    const run = await ctx.db.get(args.runId);
    if (!run) {
      return null;
    }

    let trace: any = undefined;
    if (args.includeTrace) {
      if (run.traceStorage === "inline") {
        trace = run.trace;
      } else if (run.traceId) {
        const traceDoc = await ctx.db.get(run.traceId);
        trace = traceDoc?.trace;
      }
    }

    let events: any[] = [];
    if (run.correlationId) {
      const timeline = await ctx.db
        .query("debugEvents")
        .withIndex("by_correlationId_createdAt", (q) =>
          q.eq("correlationId", run.correlationId!),
        )
        .order("desc")
        .take(timelineLimit);
      events = timeline.reverse();
    }

    return {
      run: runSummary(run),
      trace,
      events,
    };
  },
});
