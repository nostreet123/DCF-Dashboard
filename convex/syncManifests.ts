import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireSyncToken } from "./syncAuth";

const PageType = v.union(v.literal("current"), v.literal("archive"));

export const getLatest = query({
  args: {
    syncToken: v.optional(v.string()),
    pageType: PageType,
  },
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const result = await ctx.db
      .query("syncManifests")
      .withIndex("by_pageType_fetchedAt", (q) => q.eq("pageType", args.pageType))
      .order("desc")
      .take(1);
    return result[0] ?? null;
  },
});

export const upsert = mutation({
  args: {
    syncToken: v.optional(v.string()),
    pageType: PageType,
    manifestHash: v.string(),
    source: v.string(),
    itemCount: v.number(),
  },
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const existing = await ctx.db
      .query("syncManifests")
      .withIndex("by_pageType_fetchedAt", (q) => q.eq("pageType", args.pageType))
      .order("desc")
      .take(1);
    const latest = existing[0];
    if (latest && latest.manifestHash === args.manifestHash) {
      await ctx.db.patch(latest._id, {
        fetchedAt: Date.now(),
        itemCount: args.itemCount,
        source: args.source,
      });
      return latest._id;
    }
    return ctx.db.insert("syncManifests", {
      pageType: args.pageType,
      manifestHash: args.manifestHash,
      source: args.source,
      itemCount: args.itemCount,
      fetchedAt: Date.now(),
    });
  },
});
