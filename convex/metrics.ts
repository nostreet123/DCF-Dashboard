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
    const countQuery = async (
      getPage: (cursor: string | null, numItems: number) => Promise<{
        page: Array<unknown>;
        isDone: boolean;
        continueCursor: string | null;
      }>,
    ) => {
      const PAGE_SIZE = 1000;
      let cursor: string | null = null;
      let total = 0;
      while (true) {
        const result = await getPage(cursor, PAGE_SIZE);
        total += result.page.length;
        if (result.isDone) {
          break;
        }
        cursor = result.continueCursor;
      }
      return total;
    };

    const [categories, regions, datasets, snapshots] = await Promise.all([
      countQuery((cursor, numItems) =>
        ctx.db
          .query("categories")
          .withIndex("by_slug", (q) => q)
          .paginate({ cursor, numItems }),
      ),
      countQuery((cursor, numItems) =>
        ctx.db
          .query("regions")
          .withIndex("by_code", (q) => q)
          .paginate({ cursor, numItems }),
      ),
      countQuery((cursor, numItems) =>
        ctx.db
          .query("datasets")
          .withIndex("by_key", (q) => q)
          .paginate({ cursor, numItems }),
      ),
      countQuery((cursor, numItems) =>
        ctx.db
          .query("snapshots")
          .withIndex("by_asOfDate", (q) => q)
          .paginate({ cursor, numItems }),
      ),
    ]);

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
