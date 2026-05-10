import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { normalizeOptionalSymbol, normalizePositiveIntegerLimit } from "./normalization";
import { findExistingByRequestId } from "./requestIdDedupe";
import { requireSyncToken } from "./syncAuth";

const TraceStorage = v.union(
  v.literal("none"),
  v.literal("inline"),
  v.literal("external"),
);

const RunStatus = v.union(v.literal("success"), v.literal("error"));
const JsonObject = v.record(v.string(), v.any());

const valuationRunValidator = v.object({
  _id: v.id("valuationRuns"),
  _creationTime: v.number(),
  createdAt: v.number(),
  engineVersion: v.string(),
  status: RunStatus,
  error: v.optional(v.string()),
  requestId: v.optional(v.string()),
  symbol: v.optional(v.string()),
  inputs: JsonObject,
  normalizedInputs: v.optional(JsonObject),
  provenance: v.optional(JsonObject),
  resultSummary: v.optional(JsonObject),
  primaryKeyNorm: v.optional(v.string()),
  regionCode: v.optional(v.string()),
  asOfDate: v.optional(v.string()),
  traceStorage: TraceStorage,
  trace: v.optional(JsonObject),
  traceByteSize: v.optional(v.number()),
  traceId: v.optional(v.id("valuationRunTraces")),
});

const valuationRunTraceValidator = v.object({
  _id: v.id("valuationRunTraces"),
  _creationTime: v.number(),
  runId: v.id("valuationRuns"),
  createdAt: v.number(),
  byteSize: v.number(),
  trace: JsonObject,
});

type RunPick = {
  _id: Id<"valuationRuns">;
  status: "success" | "error";
  traceId?: Id<"valuationRunTraces">;
  createdAt: number;
  _creationTime: number;
};

const pickBestRun = <T extends RunPick>(runs: T[]) => {
  if (runs.length === 0) {
    return null;
  }
  const score = (run: RunPick) => [
    run.status === "success" ? 1 : 0,
    run.traceId ? 1 : 0,
    run.createdAt ?? 0,
    run._creationTime,
  ];
  let best = runs[0];
  let bestScore = score(best);
  for (let i = 1; i < runs.length; i += 1) {
    const candidate = runs[i];
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

const runSummary = (run: any) => {
  const summary = { ...run };
  if ("trace" in summary) {
    delete summary.trace;
  }
  return summary;
};

const normalizeLimit = (requested: number | undefined) =>
  normalizePositiveIntegerLimit(requested, 50, 200);

export const requireValuationReadAccess = (syncToken: string | undefined) => {
  requireSyncToken(syncToken);
};

export const create = mutation({
  args: {
    syncToken: v.optional(v.string()),
    engineVersion: v.string(),
    status: RunStatus,
    error: v.optional(v.string()),
    inputs: JsonObject,
    normalizedInputs: v.optional(JsonObject),
    provenance: v.optional(JsonObject),
    resultSummary: v.optional(JsonObject),
    primaryKeyNorm: v.optional(v.string()),
    regionCode: v.optional(v.string()),
    asOfDate: v.optional(v.string()),
    traceStorage: TraceStorage,
    trace: v.optional(JsonObject),
    traceByteSize: v.optional(v.number()),
    requestId: v.optional(v.string()),
    symbol: v.optional(v.string()),
  },
  returns: v.object({
    runId: v.id("valuationRuns"),
    traceId: v.optional(v.id("valuationRunTraces")),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const symbol = normalizeOptionalSymbol(args.symbol);

    if (args.requestId) {
      const existing = await findExistingByRequestId<RunPick & { symbol?: string }>(
        {
          ctx,
          table: "valuationRuns",
          requestId: args.requestId,
          pickBest: (matches) => pickBestRun(matches),
        },
      );
      if (existing) {
        let traceId = existing.traceId;
        if (
          args.traceStorage === "external" &&
          !traceId &&
          args.trace !== undefined
        ) {
          traceId = await ctx.db.insert("valuationRunTraces", {
            runId: existing._id,
            createdAt: Date.now(),
            byteSize: args.traceByteSize ?? 0,
            trace: args.trace,
          });
          await ctx.db.patch(existing._id, { traceId });
        }
        if (symbol && existing.symbol !== symbol) {
          await ctx.db.patch(existing._id, { symbol });
        }
        return { runId: existing._id, traceId };
      }
    }

    const createdAt = Date.now();
    const runId = await ctx.db.insert("valuationRuns", {
      createdAt,
      engineVersion: args.engineVersion,
      status: args.status,
      error: args.error,
      requestId: args.requestId,
      symbol,
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
    trace: JsonObject,
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
    if (run.traceStorage === "inline") {
      throw new ConvexError({
        code: "CONFLICT",
        message: "Trace already stored inline",
      });
    }
    if (run.traceId) {
      return { traceId: run.traceId };
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
    syncToken: v.optional(v.string()),
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
    requireValuationReadAccess(args.syncToken);
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
    syncToken: v.optional(v.string()),
    primaryKeyNorm: v.string(),
    regionCode: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(valuationRunValidator),
  handler: async (ctx, args) => {
    requireValuationReadAccess(args.syncToken);
    const limit = normalizeLimit(args.limit);
    if (args.regionCode) {
      const runs = await ctx.db
        .query("valuationRuns")
        .withIndex("by_primaryKeyNorm_region_createdAt", (q: any) =>
          q
            .eq("primaryKeyNorm", args.primaryKeyNorm)
            .eq("regionCode", args.regionCode),
        )
        .order("desc")
        .take(limit);
      return runs.map((run) => runSummary(run));
    }
    const runs = await ctx.db
      .query("valuationRuns")
      .withIndex("by_primaryKeyNorm_createdAt", (q: any) =>
        q.eq("primaryKeyNorm", args.primaryKeyNorm),
      )
      .order("desc")
      .take(limit);
    return runs.map((run) => runSummary(run));
  },
});

export const listByTicker = query({
  args: {
    syncToken: v.optional(v.string()),
    symbol: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(valuationRunValidator),
  handler: async (ctx, args) => {
    requireValuationReadAccess(args.syncToken);
    const symbol = normalizeOptionalSymbol(args.symbol);
    if (!symbol) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Symbol is required",
      });
    }
    const limit = normalizeLimit(args.limit);
    const runs = await ctx.db
      .query("valuationRuns")
      .withIndex("by_symbol_createdAt", (q: any) => q.eq("symbol", symbol))
      .order("desc")
      .take(limit);
    return runs.map((run) => runSummary(run));
  },
});
