import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { requireSyncToken } from "./syncAuth";

const TraceStorage = v.union(
  v.literal("none"),
  v.literal("inline"),
  v.literal("external"),
);

const RunStatus = v.union(v.literal("success"), v.literal("error"));

const valuationRunValidator = v.object({
  _id: v.id("valuationRuns"),
  _creationTime: v.number(),
  createdAt: v.number(),
  engineVersion: v.string(),
  status: RunStatus,
  error: v.optional(v.string()),
  inputs: v.any(),
  normalizedInputs: v.optional(v.any()),
  provenance: v.optional(v.any()),
  resultSummary: v.optional(v.any()),
  primaryKeyNorm: v.optional(v.string()),
  regionCode: v.optional(v.string()),
  asOfDate: v.optional(v.string()),
  traceStorage: TraceStorage,
  trace: v.optional(v.any()),
  traceByteSize: v.optional(v.number()),
  traceId: v.optional(v.id("valuationRunTraces")),
});

const valuationRunTraceValidator = v.object({
  _id: v.id("valuationRunTraces"),
  _creationTime: v.number(),
  runId: v.id("valuationRuns"),
  createdAt: v.number(),
  byteSize: v.number(),
  trace: v.any(),
});

const runSummary = (run: any) => {
  const summary = { ...run };
  if ("trace" in summary) {
    delete summary.trace;
  }
  return summary;
};

const normalizeLimit = (requested: number | undefined) => {
  const DEFAULT_LIMIT = 50;
  const MAX_LIMIT = 200;
  if (requested === undefined) {
    return DEFAULT_LIMIT;
  }
  const limit = Number(requested);
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: "Limit must be a positive integer",
    });
  }
  return Math.min(limit, MAX_LIMIT);
};

export const create = mutation({
  args: {
    syncToken: v.optional(v.string()),
    engineVersion: v.string(),
    status: RunStatus,
    error: v.optional(v.string()),
    inputs: v.any(),
    normalizedInputs: v.optional(v.any()),
    provenance: v.optional(v.any()),
    resultSummary: v.optional(v.any()),
    primaryKeyNorm: v.optional(v.string()),
    regionCode: v.optional(v.string()),
    asOfDate: v.optional(v.string()),
    traceStorage: TraceStorage,
    trace: v.optional(v.any()),
    traceByteSize: v.optional(v.number()),
  },
  returns: v.object({
    runId: v.id("valuationRuns"),
    traceId: v.optional(v.id("valuationRunTraces")),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const createdAt = Date.now();
    const runId = await ctx.db.insert("valuationRuns", {
      createdAt,
      engineVersion: args.engineVersion,
      status: args.status,
      error: args.error,
      inputs: args.inputs,
      normalizedInputs: args.normalizedInputs,
      provenance: args.provenance,
      resultSummary: args.resultSummary,
      primaryKeyNorm: args.primaryKeyNorm,
      regionCode: args.regionCode,
      asOfDate: args.asOfDate,
      traceStorage: args.traceStorage,
      trace: args.traceStorage === "inline" ? args.trace : undefined,
      traceByteSize: args.traceByteSize,
      traceId: undefined,
    });

    let traceId = undefined;
    if (args.traceStorage === "external" && args.trace !== undefined) {
      traceId = await ctx.db.insert("valuationRunTraces", {
        runId,
        createdAt,
        byteSize: args.traceByteSize ?? 0,
        trace: args.trace,
      });
      await ctx.db.patch(runId, { traceId });
    }

    return { runId, traceId };
  },
});

export const attachTrace = mutation({
  args: {
    syncToken: v.optional(v.string()),
    runId: v.id("valuationRuns"),
    trace: v.any(),
    traceByteSize: v.optional(v.number()),
  },
  returns: v.object({
    traceId: v.id("valuationRunTraces"),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Run not found",
      });
    }
    const traceId = await ctx.db.insert("valuationRunTraces", {
      runId: args.runId,
      createdAt: Date.now(),
      byteSize: args.traceByteSize ?? 0,
      trace: args.trace,
    });
    await ctx.db.patch(args.runId, { traceId, traceStorage: "external" });
    return { traceId };
  },
});

export const get = query({
  args: {
    runId: v.id("valuationRuns"),
    includeTrace: v.optional(v.boolean()),
  },
  returns: v.union(
    v.null(),
    v.object({
      run: valuationRunValidator,
      trace: v.optional(valuationRunTraceValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      return null;
    }
    if (!args.includeTrace) {
      return { run: runSummary(run) };
    }
    if (run.traceStorage === "inline") {
      return { run };
    }
    if (run.traceId) {
      const trace = await ctx.db.get(run.traceId);
      if (trace) {
        return { run: runSummary(run), trace };
      }
    }
    return { run: runSummary(run) };
  },
});

export const listBySymbol = query({
  args: {
    primaryKeyNorm: v.string(),
    regionCode: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(valuationRunValidator),
  handler: async (ctx, args) => {
    const limit = normalizeLimit(args.limit);
    if (args.regionCode) {
      const runs = await ctx.db
        .query("valuationRuns")
        .withIndex("by_primaryKeyNorm_region_createdAt", (q) =>
          q
            .eq("primaryKeyNorm", args.primaryKeyNorm)
            .eq("regionCode", args.regionCode),
        )
        .order("desc")
        .take(limit);
      return runs.map(runSummary);
    }
    const runs = await ctx.db
      .query("valuationRuns")
      .withIndex("by_primaryKeyNorm_createdAt", (q) =>
        q.eq("primaryKeyNorm", args.primaryKeyNorm),
      )
      .order("desc")
      .take(limit);
    return runs.map(runSummary);
  },
});
