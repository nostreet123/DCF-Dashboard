import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSyncToken } from "./syncAuth";

const PageType = v.union(v.literal("current"), v.literal("archive"));

const AsOfDateSource = v.union(
  v.literal("label"),
  v.literal("page_last_update"),
  v.literal("filename_inferred"),
);

export const record = mutation({
  args: {
    syncToken: v.optional(v.string()),
    asset: v.object({
      sourcePageUrl: v.string(),
      pageType: PageType,
      pageLastUpdated: v.optional(v.string()),
      sourceUrl: v.string(),
      fileName: v.string(),
      linkLabel: v.string(),
      resolved: v.boolean(),
      resolvedDatasetKey: v.optional(v.string()),
      resolvedRegionCode: v.optional(v.string()),
      resolvedAsOfDate: v.optional(v.string()),
      resolvedAsOfDateSource: v.optional(AsOfDateSource),
      resolutionError: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    await ctx.db.insert("assets", {
      sourcePageUrl: args.asset.sourcePageUrl,
      pageType: args.asset.pageType,
      pageLastUpdated: args.asset.pageLastUpdated,
      sourceUrl: args.asset.sourceUrl,
      fileName: args.asset.fileName,
      linkLabel: args.asset.linkLabel,
      resolved: args.asset.resolved,
      resolvedDatasetKey: args.asset.resolvedDatasetKey,
      resolvedRegionCode: args.asset.resolvedRegionCode,
      resolvedAsOfDate: args.asset.resolvedAsOfDate,
      resolvedAsOfDateSource: args.asset.resolvedAsOfDateSource,
      resolutionError: args.asset.resolutionError,
      discoveredAt: Date.now(),
    });
  },
});

export const recordBatch = mutation({
  args: {
    syncToken: v.optional(v.string()),
    assets: v.array(
      v.object({
        sourcePageUrl: v.string(),
        pageType: PageType,
        pageLastUpdated: v.optional(v.string()),
        sourceUrl: v.string(),
        fileName: v.string(),
        linkLabel: v.string(),
        resolved: v.boolean(),
        resolvedDatasetKey: v.optional(v.string()),
        resolvedRegionCode: v.optional(v.string()),
        resolvedAsOfDate: v.optional(v.string()),
        resolvedAsOfDateSource: v.optional(AsOfDateSource),
        resolutionError: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const discoveredAt = Date.now();
    for (const asset of args.assets) {
      await ctx.db.insert("assets", {
        sourcePageUrl: asset.sourcePageUrl,
        pageType: asset.pageType,
        pageLastUpdated: asset.pageLastUpdated,
        sourceUrl: asset.sourceUrl,
        fileName: asset.fileName,
        linkLabel: asset.linkLabel,
        resolved: asset.resolved,
        resolvedDatasetKey: asset.resolvedDatasetKey,
        resolvedRegionCode: asset.resolvedRegionCode,
        resolvedAsOfDate: asset.resolvedAsOfDate,
        resolvedAsOfDateSource: asset.resolvedAsOfDateSource,
        resolutionError: asset.resolutionError,
        discoveredAt,
      });
    }
  },
});
