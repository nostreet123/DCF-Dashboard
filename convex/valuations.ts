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

const TraceStorage = v.union(
  v.literal("none"),
  v.literal("inline"),
  v.literal("external"),
);

const RunStatus = v.union(v.literal("success"), v.literal("error"));

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
    throw new Error("Limit must be a positive integer");
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
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new Error("Run not found");
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
      return { run: runSummary(run), trace };
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
  handler: async (ctx, args) => {
    const limit = normalizeLimit(args.limit);
    if (args.regionCode) {
      return ctx.db
        .query("valuationRuns")
        .withIndex("by_primaryKeyNorm_region_createdAt", (q) =>
          q
            .eq("primaryKeyNorm", args.primaryKeyNorm)
            .eq("regionCode", args.regionCode),
        )
        .order("desc")
        .take(limit)
        .map(runSummary);
    }
    return ctx.db
      .query("valuationRuns")
      .withIndex("by_primaryKeyNorm_createdAt", (q) =>
        q.eq("primaryKeyNorm", args.primaryKeyNorm),
      )
      .order("desc")
      .take(limit)
      .map(runSummary);
  },
});
