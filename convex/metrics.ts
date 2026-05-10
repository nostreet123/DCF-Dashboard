import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Bounded count limit.  For large tables (snapshots, tableData) we fetch at
 * most BOUNDED_LIMIT + 1 rows and report whether the true count exceeds the
 * limit.  Reference tables (categories, regions, datasets) are small and
 * stable so we collect them in full.
 */
const BOUNDED_LIMIT = 1000;

export const getCounts = query({
  args: {},
  returns: v.object({
    categories: v.number(),
    regions: v.number(),
    datasets: v.number(),
    snapshots: v.number(),
    isSnapshotsCapped: v.boolean(),
    tableData: v.number(),
    isTableDataCapped: v.boolean(),
  }),
  handler: async (ctx) => {
    // Reference tables — small & stable, exact counts via .collect()
    const [categoryRows, regionRows, datasetRows, snapshotRows, tableDataRows] =
      await Promise.all([
        ctx.db
          .query("categories")
          .withIndex("by_slug", (q) => q)
          .collect(),
        ctx.db
          .query("regions")
          .withIndex("by_code", (q) => q)
          .collect(),
        ctx.db
          .query("datasets")
          .withIndex("by_key", (q) => q)
          .collect(),
        // Large tables — bounded counts via .take(LIMIT + 1)
        ctx.db
          .query("snapshots")
          .withIndex("by_asOfDate", (q) => q)
          .take(BOUNDED_LIMIT + 1),
        ctx.db
          .query("tableData")
          .withIndex("by_snapshot_build_rowIndex", (q) => q)
          .take(BOUNDED_LIMIT + 1),
      ]);

    return {
      categories: categoryRows.length,
      regions: regionRows.length,
      datasets: datasetRows.length,
      snapshots: Math.min(snapshotRows.length, BOUNDED_LIMIT),
      isSnapshotsCapped: snapshotRows.length > BOUNDED_LIMIT,
      tableData: Math.min(tableDataRows.length, BOUNDED_LIMIT),
      isTableDataCapped: tableDataRows.length > BOUNDED_LIMIT,
    };
  },
});
