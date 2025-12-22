import { mutation } from "./_generated/server";
import { v } from "convex/values";

const requireSyncToken = (syncToken: string | null | undefined) => {
  const expected = process.env.DAMODARAN_SYNC_TOKEN;
  if (expected && syncToken !== expected) {
    throw new Error("Invalid sync token");
  }
};

export const record = mutation({
  args: {
    syncToken: v.optional(v.string()),
    asset: v.object({
      sourcePageUrl: v.string(),
      pageType: v.string(),
      pageLastUpdated: v.optional(v.string()),
      sourceUrl: v.string(),
      fileName: v.string(),
      linkLabel: v.string(),
      resolved: v.boolean(),
      resolvedDatasetKey: v.optional(v.string()),
      resolvedRegionCode: v.optional(v.string()),
      resolvedAsOfDate: v.optional(v.string()),
      resolvedAsOfDateSource: v.optional(v.string()),
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
