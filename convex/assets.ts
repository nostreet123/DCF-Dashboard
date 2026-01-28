import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { requireSyncToken } from "./syncAuth";

const PageType = v.union(v.literal("current"), v.literal("archive"));

const AsOfDateSource = v.union(
  v.literal("label"),
  v.literal("page_last_update"),
  v.literal("filename_inferred"),
);

type AssetPick = {
  _id: Id<"assets">;
  resolved: boolean;
  discoveredAt?: number;
  _creationTime: number;
};

const pickBestAsset = (assets: AssetPick[]) => {
  if (assets.length === 0) {
    return null;
  }
  const score = (asset: AssetPick) => [
    asset.resolved ? 1 : 0,
    asset.discoveredAt ?? 0,
    asset._creationTime,
  ];
  let best = assets[0];
  let bestScore = score(best);
  for (let i = 1; i < assets.length; i += 1) {
    const candidate = assets[i];
    const candidateScore = score(candidate);
    for (let j = 0; j < candidateScore.length; j += 1) {
      if (candidateScore[j] > bestScore[j]) {
        best = candidate;
        bestScore = candidateScore;
        break;
      }
      if (candidateScore[j] < bestScore[j]) {
        break;
      }
    }
  }
  return best;
};

const findExistingAsset = async (ctx: { db: any }, assetKey: string) => {
  const matches = await ctx.db
    .query("assets")
    .withIndex("by_assetKey", (q: any) => q.eq("assetKey", assetKey))
    .take(2);
  if (matches.length === 0) {
    return null;
  }
  if (matches.length === 1) {
    return matches[0];
  }
  const allMatches = await ctx.db
    .query("assets")
    .withIndex("by_assetKey", (q: any) => q.eq("assetKey", assetKey))
    .collect();
  return pickBestAsset(allMatches) ?? matches[0];
};

const getMaxAssetBatch = () => {
  const raw = process.env.ASSETS_RECORD_MAX_ROWS;
  if (!raw) {
    return 500;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 500;
  }
  const floored = Math.floor(parsed);
  if (floored <= 0) {
    return 500;
  }
  return Math.min(1000, floored);
};

export const buildAssetKey = (asset: {
  sourcePageUrl: string;
  pageType: string;
  pageLastUpdated?: string;
  sourceUrl: string;
  fileName: string;
  linkLabel: string;
  resolved: boolean;
  resolvedDatasetKey?: string;
  resolvedRegionCode?: string;
  resolvedAsOfDate?: string;
  resolvedAsOfDateSource?: string;
  resolutionError?: string;
}) =>
  [
    asset.sourcePageUrl,
    asset.pageType,
    asset.pageLastUpdated ?? "",
    asset.sourceUrl,
    asset.fileName,
    asset.linkLabel,
    asset.resolved ? "1" : "0",
    asset.resolvedDatasetKey ?? "",
    asset.resolvedRegionCode ?? "",
    asset.resolvedAsOfDate ?? "",
    asset.resolvedAsOfDateSource ?? "",
    asset.resolutionError ?? "",
  ].join("\u001f");

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
  returns: v.object({
    assetId: v.id("assets"),
    created: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const assetKey = buildAssetKey(args.asset);
    const existing = await findExistingAsset(ctx, assetKey);
    if (existing) {
      return { assetId: existing._id, created: false };
    }
    const assetId = await ctx.db.insert("assets", {
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
      assetKey,
      discoveredAt: Date.now(),
    });
    return { assetId, created: true };
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
  returns: v.object({
    inserted: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const maxAssets = getMaxAssetBatch();
    if (args.assets.length > maxAssets) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: `Batch too large: max ${maxAssets} assets per call`,
      });
    }
    const discoveredAt = Date.now();
    let inserted = 0;
    let skipped = 0;
    const seen = new Set<string>();
    for (const asset of args.assets) {
      const assetKey = buildAssetKey(asset);
      if (seen.has(assetKey)) {
        skipped += 1;
        continue;
      }
      seen.add(assetKey);
      const existing = await findExistingAsset(ctx, assetKey);
      if (existing) {
        skipped += 1;
        continue;
      }
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
        assetKey,
        discoveredAt,
      });
      inserted += 1;
    }
    return { inserted, skipped };
  },
});
