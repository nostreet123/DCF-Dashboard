import { query } from "./_generated/server";
import { ConvexError, v } from "convex/values";

const DEFAULT_DATASET = "wacc";
const DEFAULT_REGION = "us";

const normalizeLimit = (requested: number | undefined) => {
  const DEFAULT_LIMIT = 20;
  const MAX_LIMIT = 50;
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

const findActiveSnapshot = async (
  ctx: any,
  datasetKey: string,
  regionCode: string,
) => {
  const candidates = await ctx.db
    .query("snapshots")
    .withIndex("by_identity", (q: any) =>
      q.eq("datasetKey", datasetKey).eq("regionCode", regionCode),
    )
    .order("desc")
    .take(25);
  return candidates.find((snapshot: any) => snapshot.activeBuildId) ?? null;
};

export const search = query({
  args: {
    q: v.string(),
    datasetKey: v.optional(v.string()),
    regionCode: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    snapshot: v.union(
      v.null(),
      v.object({
        snapshotId: v.id("snapshots"),
        datasetKey: v.string(),
        regionCode: v.string(),
        asOfDate: v.string(),
        buildId: v.string(),
      }),
    ),
    matches: v.array(
      v.object({
        rowIndex: v.number(),
        primaryKey: v.string(),
        primaryKeyNorm: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const queryText = args.q.trim();
    if (!queryText) {
      return { snapshot: null, matches: [] };
    }
    const datasetKey = args.datasetKey ?? DEFAULT_DATASET;
    const regionCode = args.regionCode ?? DEFAULT_REGION;
    const snapshot = await findActiveSnapshot(ctx, datasetKey, regionCode);
    if (!snapshot || !snapshot.activeBuildId) {
      return { snapshot: null, matches: [] };
    }

    const limit = normalizeLimit(args.limit);
    const rows = await ctx.db
      .query("tableData")
      .withSearchIndex("search_primaryKey", (q: any) =>
        q
          .search("primaryKey", queryText)
          .eq("snapshotId", snapshot._id)
          .eq("buildId", snapshot.activeBuildId),
      )
      .take(limit);

    return {
      snapshot: {
        snapshotId: snapshot._id,
        datasetKey: snapshot.datasetKey,
        regionCode: snapshot.regionCode,
        asOfDate: snapshot.asOfDate,
        buildId: snapshot.activeBuildId,
      },
      matches: rows.map((row: any) => ({
        rowIndex: row.rowIndex,
        primaryKey: row.primaryKey,
        primaryKeyNorm: row.primaryKeyNorm,
      })),
    };
  },
});
