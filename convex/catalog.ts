import { query } from "./_generated/server";
import { v } from "convex/values";

const DataType = v.union(
  v.literal("industry"),
  v.literal("country"),
  v.literal("timeseries"),
  v.literal("other"),
);

export const getSidebar = query({
  args: {},
  returns: v.object({
    categories: v.array(
      v.object({
        slug: v.string(),
        name: v.string(),
        description: v.string(),
        sortOrder: v.number(),
        datasets: v.array(
          v.object({
            key: v.string(),
            name: v.string(),
            description: v.string(),
            categorySlug: v.string(),
            dataType: DataType,
            defaultRegionCode: v.string(),
          }),
        ),
      }),
    ),
    regions: v.array(
      v.object({
        code: v.string(),
        name: v.string(),
        sortOrder: v.number(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_slug", (q: any) => q)
      .collect();
    const datasets = await ctx.db
      .query("datasets")
      .withIndex("by_key", (q: any) => q)
      .collect();
    const regions = await ctx.db
      .query("regions")
      .withIndex("by_code", (q: any) => q)
      .collect();

    const datasetsByCategory = new Map<string, typeof datasets>();
    for (const dataset of datasets) {
      const list = datasetsByCategory.get(dataset.categorySlug) ?? [];
      list.push(dataset);
      datasetsByCategory.set(dataset.categorySlug, list);
    }

    const sortedCategories = [...categories].sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.name.localeCompare(b.name);
    });

    const sortedRegions = [...regions].sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.name.localeCompare(b.name);
    });

    return {
      categories: sortedCategories.map((category) => {
        const categoryDatasets = datasetsByCategory.get(category.slug) ?? [];
        const sortedDatasets = [...categoryDatasets].sort((a, b) =>
          a.name.localeCompare(b.name),
        );
        return {
          slug: category.slug,
          name: category.name,
          description: category.description,
          sortOrder: category.sortOrder,
          datasets: sortedDatasets.map((dataset) => ({
            key: dataset.key,
            name: dataset.name,
            description: dataset.description,
            categorySlug: dataset.categorySlug,
            dataType: dataset.dataType ?? "other",
            defaultRegionCode: dataset.defaultRegionCode,
          })),
        };
      }),
      regions: sortedRegions.map((region) => ({
        code: region.code,
        name: region.name,
        sortOrder: region.sortOrder,
      })),
    };
  },
});
