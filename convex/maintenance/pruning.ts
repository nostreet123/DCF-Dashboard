import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireSyncToken } from "../syncAuth";
import {
  RetentionDays,
  cutoffMs,
  normalizeDeleteLimit,
  normalizeRetentionDays,
} from "./shared";
import { buildTraceRefClearPatch } from "./pruning.logic";

const processPruneCandidates = async <T>({
  candidates,
  cutoff,
  dryRun,
  getTimestamp,
  onDelete,
}: {
  candidates: T[];
  cutoff: number;
  dryRun: boolean;
  getTimestamp: (candidate: T) => number;
  onDelete: (candidate: T) => Promise<void>;
}) => {
  let deleted = 0;
  for (const candidate of candidates) {
    if (getTimestamp(candidate) >= cutoff) {
      break;
    }
    if (!dryRun) {
      await onDelete(candidate);
    }
    deleted += 1;
  }
  return deleted;
};

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
    }),
    cutoff: v.object({
      syncLogs: v.number(),
      syncErrors: v.number(),
      syncLogIncrements: v.number(),
      valuationRunTraces: v.number(),
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

    const syncLogs = await ctx.db
      .query("syncLogs")
      .withIndex("by_startedAt", (q) => q)
      .order("asc")
      .take(maxDeletes);
    const deletedSyncLogs = await processPruneCandidates({
      candidates: syncLogs,
      cutoff: syncLogsCutoff,
      dryRun,
      getTimestamp: (log) => log.startedAt,
      onDelete: async (log) => {
        await ctx.db.delete(log._id);
      },
    });

    const syncErrors = await ctx.db
      .query("syncErrors")
      .withIndex("by_timestamp", (q) => q)
      .order("asc")
      .take(maxDeletes);
    const deletedSyncErrors = await processPruneCandidates({
      candidates: syncErrors,
      cutoff: syncErrorsCutoff,
      dryRun,
      getTimestamp: (error) => error.timestamp,
      onDelete: async (error) => {
        await ctx.db.delete(error._id);
      },
    });

    const increments = await ctx.db
      .query("syncLogIncrements")
      .withIndex("by_createdAt", (q) => q)
      .order("asc")
      .take(maxDeletes);
    const deletedSyncLogIncrements = await processPruneCandidates({
      candidates: increments,
      cutoff: syncLogIncrementsCutoff,
      dryRun,
      getTimestamp: (increment) => increment.createdAt,
      onDelete: async (increment) => {
        await ctx.db.delete(increment._id);
      },
    });

    const traces = await ctx.db
      .query("valuationRunTraces")
      .withIndex("by_createdAt", (q) => q)
      .order("asc")
      .take(maxDeletes);
    const deletedTraces = await processPruneCandidates({
      candidates: traces,
      cutoff: valuationRunTracesCutoff,
      dryRun,
      getTimestamp: (trace) => trace.createdAt,
      onDelete: async (trace) => {
        await ctx.db.delete(trace._id);
        const run = await ctx.db.get(trace.runId);
        const patch = buildTraceRefClearPatch(run, trace._id);
        if (patch) {
          await ctx.db.patch(trace.runId, patch);
        }
      },
    });

    return {
      dryRun,
      deleted: {
        syncLogs: deletedSyncLogs,
        syncErrors: deletedSyncErrors,
        syncLogIncrements: deletedSyncLogIncrements,
        valuationRunTraces: deletedTraces,
      },
      cutoff: {
        syncLogs: syncLogsCutoff,
        syncErrors: syncErrorsCutoff,
        syncLogIncrements: syncLogIncrementsCutoff,
        valuationRunTraces: valuationRunTracesCutoff,
      },
    };
  },
});
