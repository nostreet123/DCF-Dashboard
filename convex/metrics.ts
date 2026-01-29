import { query } from "./_generated/server";

export const getCounts = query({
  args: {},
  handler: async (ctx) => {
    const countQuery = async (tableName: "categories" | "regions" | "datasets" | "snapshots") => {
      const PAGE_SIZE = 1000;
      let cursor: string | null = null;
      let total = 0;
      while (true) {
        const result = await ctx.db.query(tableName).paginate({
          cursor,
          numItems: PAGE_SIZE,
        });
        total += result.page.length;
        if (result.isDone) {
          break;
        }
        cursor = result.continueCursor;
      }
      return total;
    };

    const [categories, regions, datasets, snapshots] = await Promise.all([
      countQuery("categories"),
      countQuery("regions"),
      countQuery("datasets"),
      countQuery("snapshots"),
    ]);

    // Bounded count for tableData
    const LIMIT = 1000;
    const tableDataRows = await ctx.db.query("tableData").take(LIMIT + 1);
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
