import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireSyncToken } from "./syncAuth";

export const getCounts = query({
  args: {
    syncToken: v.optional(v.string()),
  },
  returns: v.object({
    categories: v.number(),
    regions: v.number(),
    datasets: v.number(),
    snapshots: v.number(),
    isSnapshotsCapped: v.boolean(),
    tableData: v.number(),
    isTableDataCapped: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const [categories, regions, datasets] = await Promise.all([
      ctx.db.query("categories").withIndex("by_slug", (q) => q).collect(),
      ctx.db.query("regions").withIndex("by_code", (q) => q).collect(),
      ctx.db.query("datasets").withIndex("by_key", (q) => q).collect(),
    ]);

    const SNAPSHOT_LIMIT = 2000;
    const snapshotSample = await ctx.db
      .query("snapshots")
      .withIndex("by_asOfDate", (q) => q)
      .take(SNAPSHOT_LIMIT + 1);
    const isSnapshotsCapped = snapshotSample.length > SNAPSHOT_LIMIT;
    const snapshotCount = isSnapshotsCapped ? SNAPSHOT_LIMIT : snapshotSample.length;

    // Bounded count for tableData
    const LIMIT = 1000;
    const tableDataSample = await ctx.db
      .query("tableData")
      .withIndex("by_snapshot_build_rowIndex", (q) => q)
      .take(LIMIT + 1);
    const isTableDataCapped = tableDataSample.length > LIMIT;
    const tableDataCount = isTableDataCapped ? LIMIT : tableDataSample.length;

    return {
      categories: categories.length,
      regions: regions.length,
      datasets: datasets.length,
      snapshots: snapshotCount,
      isSnapshotsCapped,
      tableData: tableDataCount,
      isTableDataCapped,
    };
  },
});
