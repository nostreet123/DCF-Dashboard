import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireSyncToken } from "../syncAuth";
import {
  RetentionDays,
  cutoffMs,
  normalizeDeleteLimit,
  normalizeRetentionDays,
} from "./shared";

export const pruneOperationalData = mutation({
  args: {
    syncToken: v.optional(v.string()),
    dryRun: v.optional(v.boolean()),
    retentionDays: v.optional(RetentionDays),
    maxDeletes: v.optional(v.number()),
  },
  returns: v.object({
    dryRun: v.boolean(),
    deleted: v.object({
      syncLogs: v.number(),
      syncErrors: v.number(),
      syncLogIncrements: v.number(),
      valuationRunTraces: v.number(),
      valuationRunInlineTraces: v.number(),
      debugEvents: v.number(),
    }),
    cutoff: v.object({
      syncLogs: v.number(),
      syncErrors: v.number(),
      syncLogIncrements: v.number(),
      valuationRunTraces: v.number(),
      valuationRunInlineTraces: v.number(),
      debugEventsError: v.number(),
      debugEventsStandard: v.number(),
    }),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const dryRun = args.dryRun ?? true;
    const retention = args.retentionDays ?? {};
    const maxDeletes = normalizeDeleteLimit(args.maxDeletes, 200);

    const syncLogsCutoff = cutoffMs(
      normalizeRetentionDays(retention.syncLogs, 30),
    );
    const syncErrorsCutoff = cutoffMs(
      normalizeRetentionDays(retention.syncErrors, 30),
    );
    const syncLogIncrementsCutoff = cutoffMs(
      normalizeRetentionDays(retention.syncLogIncrements, 30),
    );
    const valuationRunTracesCutoff = cutoffMs(
      normalizeRetentionDays(retention.valuationRunTraces, 30),
    );
    const valuationRunInlineTracesCutoff = cutoffMs(
      normalizeRetentionDays(retention.valuationRunInlineTraces, 30),
    );
    const debugEventsErrorCutoff = cutoffMs(
      normalizeRetentionDays(retention.debugEventsError, 90),
    );
    const debugEventsStandardCutoff = cutoffMs(
      normalizeRetentionDays(retention.debugEventsStandard, 30),
    );

    let deletedSyncLogs = 0;
    const syncLogs = await ctx.db
      .query("syncLogs")
      .withIndex("by_startedAt", (q) => q)
      .order("asc")
      .take(maxDeletes);
    for (const log of syncLogs) {
      if (log.startedAt >= syncLogsCutoff) {
        break;
      }
      if (!dryRun) {
        await ctx.db.delete(log._id);
      }
      deletedSyncLogs += 1;
    }

    let deletedSyncErrors = 0;
    const syncErrors = await ctx.db
      .query("syncErrors")
      .withIndex("by_timestamp", (q) => q)
      .order("asc")
      .take(maxDeletes);
    for (const error of syncErrors) {
      if (error.timestamp >= syncErrorsCutoff) {
        break;
      }
      if (!dryRun) {
        await ctx.db.delete(error._id);
      }
      deletedSyncErrors += 1;
    }

    let deletedSyncLogIncrements = 0;
    const increments = await ctx.db
      .query("syncLogIncrements")
      .withIndex("by_createdAt", (q) => q)
      .order("asc")
      .take(maxDeletes);
    for (const increment of increments) {
      if (increment.createdAt >= syncLogIncrementsCutoff) {
        break;
      }
      if (!dryRun) {
        await ctx.db.delete(increment._id);
      }
      deletedSyncLogIncrements += 1;
    }

    let deletedTraces = 0;
    const traces = await ctx.db
      .query("valuationRunTraces")
      .withIndex("by_createdAt", (q) => q)
      .order("asc")
      .take(maxDeletes);
    for (const trace of traces) {
      if (trace.createdAt >= valuationRunTracesCutoff) {
        break;
      }
      if (!dryRun) {
        await ctx.db.delete(trace._id);
        await ctx.db.patch(trace.runId, {
          traceId: undefined,
          traceStorage: "none",
        });
      }
      deletedTraces += 1;
    }

    let deletedInlineTraces = 0;
    const runs = await ctx.db
      .query("valuationRuns")
      .withIndex("by_createdAt", (q) => q)
      .order("asc")
      .take(maxDeletes);
    for (const run of runs) {
      if (run.createdAt >= valuationRunInlineTracesCutoff) {
        break;
      }
      if (run.traceStorage !== "inline" || run.trace === undefined) {
        continue;
      }
      if (!dryRun) {
        await ctx.db.patch(run._id, {
          trace: undefined,
          traceStorage: "none",
          traceByteSize: undefined,
        });
      }
      deletedInlineTraces += 1;
    }

    let deletedDebugEvents = 0;
    const debugEvents = await ctx.db
      .query("debugEvents")
      .withIndex("by_createdAt", (q) => q)
      .order("asc")
      .take(maxDeletes);
    for (const event of debugEvents) {
      if (event.createdAt >= debugEventsStandardCutoff) {
        break;
      }
      const cutoff =
        event.level === "error" ? debugEventsErrorCutoff : debugEventsStandardCutoff;
      if (event.createdAt >= cutoff) {
        continue;
      }
      if (!dryRun) {
        await ctx.db.delete(event._id);
      }
      deletedDebugEvents += 1;
    }

    return {
      dryRun,
      deleted: {
        syncLogs: deletedSyncLogs,
        syncErrors: deletedSyncErrors,
        syncLogIncrements: deletedSyncLogIncrements,
        valuationRunTraces: deletedTraces,
        valuationRunInlineTraces: deletedInlineTraces,
        debugEvents: deletedDebugEvents,
      },
      cutoff: {
        syncLogs: syncLogsCutoff,
        syncErrors: syncErrorsCutoff,
        syncLogIncrements: syncLogIncrementsCutoff,
        valuationRunTraces: valuationRunTracesCutoff,
        valuationRunInlineTraces: valuationRunInlineTracesCutoff,
        debugEventsError: debugEventsErrorCutoff,
        debugEventsStandard: debugEventsStandardCutoff,
      },
    };
  },
});
