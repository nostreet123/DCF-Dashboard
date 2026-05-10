import { mutation } from "./_generated/server";
import { v } from "convex/values";

import { requireSyncToken } from "./syncAuth";

export const check = mutation({
  args: {
    syncToken: v.optional(v.string()),
    key: v.string(),
    windowMs: v.number(),
    maxRequests: v.number(),
  },
  returns: v.object({
    limited: v.boolean(),
    count: v.number(),
    windowStartMs: v.number(),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);

    const maxRequests = Math.max(1, Math.floor(args.maxRequests));
    const windowMs = Math.max(1, Math.floor(args.windowMs));
    const nowMs = Date.now();
    const staleAfterMs = Math.max(windowMs * 10, 15 * 60_000);
    const staleCutoffMs = nowMs - staleAfterMs;

    if (staleCutoffMs > 0) {
      const staleRows = await ctx.db
        .query("rateLimits")
        .withIndex("by_updatedAt", (q) => q.lt("updatedAt", staleCutoffMs))
        .take(25);

      for (const staleRow of staleRows) {
        await ctx.db.delete(staleRow._id);
      }
    }

    const existing = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (!existing || nowMs - existing.windowStartMs >= windowMs) {
      if (existing) {
        await ctx.db.patch(existing._id, {
          windowStartMs: nowMs,
          count: 1,
          updatedAt: nowMs,
        });
      } else {
        await ctx.db.insert("rateLimits", {
          key: args.key,
          windowStartMs: nowMs,
          count: 1,
          updatedAt: nowMs,
        });
      }
      return {
        limited: false,
        count: 1,
        windowStartMs: nowMs,
      };
    }

    if (existing.count >= maxRequests) {
      return {
        limited: true,
        count: existing.count,
        windowStartMs: existing.windowStartMs,
      };
    }

    const nextCount = existing.count + 1;
    await ctx.db.patch(existing._id, {
      count: nextCount,
      updatedAt: nowMs,
    });

    return {
      limited: false,
      count: nextCount,
      windowStartMs: existing.windowStartMs,
    };
  },
});
