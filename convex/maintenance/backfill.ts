import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireSyncToken } from "../syncAuth";
import { buildAssetKey } from "../assets";
import { PageType, normalizePageLimit } from "./shared";

export const backfillAssetKeysPage = mutation({
  args: {
    syncToken: v.optional(v.string()),
    pageType: PageType,
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    updated: v.number(),
    nextCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const limit = normalizePageLimit(args.limit, 200);
    const result = await ctx.db
      .query("assets")
      .withIndex("by_pageType_discoveredAt", (q) => q.eq("pageType", args.pageType))
      .paginate({
        cursor: args.cursor ?? null,
        numItems: limit,
      });

    let updated = 0;
    for (const asset of result.page) {
      if (asset.assetKey) {
        continue;
      }
      const assetKey = buildAssetKey({
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
      });
      await ctx.db.patch(asset._id, { assetKey });
      updated += 1;
    }

    return {
      updated,
      nextCursor: result.continueCursor ?? null,
    };
  },
});

