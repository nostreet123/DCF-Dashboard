import { query } from "./_generated/server";

export const getCounts = query({
  args: {},
  handler: async (ctx) => {
    const [categories, regions, datasets, snapshots] = await Promise.all([
      ctx.db.query("categories").count(),
      ctx.db.query("regions").count(),
      ctx.db.query("datasets").count(),
      ctx.db.query("snapshots").count(),
    ]);

    // Bounded count for tableData
    const LIMIT = 1000;
    const tableDataTotal = await ctx.db.query("tableData").count();
    const tableDataCount = tableDataTotal > LIMIT ? LIMIT : tableDataTotal;
    const isTableDataCapped = tableDataTotal > LIMIT;

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
