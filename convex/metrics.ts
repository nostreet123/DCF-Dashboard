import { query } from "./_generated/server";
import { v } from "convex/values";

export const getCounts = query({
  args: {},
  returns: v.object({
    categories: v.number(),
    regions: v.number(),
    datasets: v.number(),
    snapshots: v.number(),
    tableData: v.number(),
    isTableDataCapped: v.boolean(),
  }),
  handler: async (ctx) => {
    // Convex allows only one paginated query per function invocation.
    // Use indexed collects here to avoid runtime "multiple paginated queries" errors.
    const [categoriesRows, regionsRows, datasetsRows, snapshotsRows] =
      await Promise.all([
        ctx.db.query("categories").withIndex("by_slug", (q) => q).collect(),
        ctx.db.query("regions").withIndex("by_code", (q) => q).collect(),
        ctx.db.query("datasets").withIndex("by_key", (q) => q).collect(),
        ctx.db.query("snapshots").withIndex("by_asOfDate", (q) => q).collect(),
      ]);

    const categories = categoriesRows.length;
    const regions = regionsRows.length;
    const datasets = datasetsRows.length;
    const snapshots = snapshotsRows.length;

    // Bounded count for tableData
    const LIMIT = 1000;
    const tableDataRows = await ctx.db
      .query("tableData")
      .withIndex("by_snapshot_build_rowIndex", (q) => q)
      .take(LIMIT + 1);
    const tableDataCount = Math.min(tableDataRows.length, LIMIT);
    const isTableDataCapped = tableDataRows.length > LIMIT;

    return {
      categories,
      regions,
      datasets,
      snapshots,
      tableData: tableDataCount,
      isTableDataCapped,
    };
  },
});
