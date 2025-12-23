import { query } from "./_generated/server";

export const getCounts = query({
  args: {},
  handler: async (ctx) => {
    const categories = await ctx.db.query("categories").collect();
    const regions = await ctx.db.query("regions").collect();
    const datasets = await ctx.db.query("datasets").collect();
    const snapshots = await ctx.db.query("snapshots").collect();
    
    // Bounded count for tableData
    const LIMIT = 1000;
    const tableData = await ctx.db.query("tableData").take(LIMIT + 1);
    const tableDataCount = tableData.length > LIMIT ? LIMIT : tableData.length;
    const isTableDataCapped = tableData.length > LIMIT;

    return {
      categories: categories.length,
      regions: regions.length,
      datasets: datasets.length,
      snapshots: snapshots.length,
      tableData: tableDataCount,
      isTableDataCapped,
    };
  },
});