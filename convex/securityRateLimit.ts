import { ConvexError, v } from "convex/values";

import { mutation } from "./_generated/server";
import { requireSyncToken } from "./syncAuth";

const MAX_WINDOW_MS = 24 * 60 * 60 * 1000;

const validatedLimit = (limit: number) => {
  if (!Number.isInteger(limit) || limit <= 0 || limit > 10000) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: "limit must be an integer between 1 and 10000",
    });
  }
  return limit;
};

const validatedWindowMs = (windowMs: number) => {
  if (!Number.isInteger(windowMs) || windowMs <= 0 || windowMs > MAX_WINDOW_MS) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: `windowMs must be an integer between 1 and ${MAX_WINDOW_MS}`,
    });
  }
  return windowMs;
};

const pruneExpiredBuckets = async (ctx: any, nowMs: number) => {
  const expiredRows = await ctx.db
    .query("securityRateBuckets")
    .withIndex("by_resetAt", (q: any) => q.lt("resetAt", nowMs))
    .take(25);
  for (const row of expiredRows) {
    await ctx.db.delete(row._id);
  }
};

type RateBucketRow = {
  _id: any;
  bucketKey: string;
  count: number;
  resetAt: number;
  updatedAt: number;
};

const listRowsByBucketKey = async (ctx: any, bucketKey: string) => {
  const matches = await ctx.db
    .query("securityRateBuckets")
    .withIndex("by_bucketKey", (q: any) => q.eq("bucketKey", bucketKey))
    .take(2);
  if (matches.length <= 1) {
    return matches;
  }
  return await ctx.db
    .query("securityRateBuckets")
    .withIndex("by_bucketKey", (q: any) => q.eq("bucketKey", bucketKey))
    .collect();
};

const pickRow = (rows: RateBucketRow[]) =>
  [...rows].sort(
    (left, right) =>
      right.resetAt - left.resetAt || right.updatedAt - left.updatedAt,
  )[0] ?? null;

export const hitBucket = mutation({
  args: {
    syncToken: v.optional(v.string()),
    bucketKey: v.string(),
    limit: v.number(),
    windowMs: v.number(),
    nowMs: v.optional(v.number()),
  },
  returns: v.object({
    allowed: v.boolean(),
    retryAfterSeconds: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const limit = validatedLimit(args.limit);
    const windowMs = validatedWindowMs(args.windowMs);
    const now = args.nowMs ?? Date.now();
    await pruneExpiredBuckets(ctx, now);

    const rows = (await listRowsByBucketKey(ctx, args.bucketKey)) as RateBucketRow[];
    const selected = pickRow(rows);

    if (!selected) {
      await ctx.db.insert("securityRateBuckets", {
        bucketKey: args.bucketKey,
        count: 1,
        resetAt: now + windowMs,
        updatedAt: now,
      });
      return { allowed: true };
    }

    const isExpired = selected.resetAt <= now;
    if (isExpired) {
      await ctx.db.patch(selected._id, {
        count: 1,
        resetAt: now + windowMs,
        updatedAt: now,
      });
      for (const row of rows) {
        if (row._id !== selected._id) {
          await ctx.db.delete(row._id);
        }
      }
      return { allowed: true };
    }

    if (selected.count >= limit) {
      const retryMs = Math.max(0, selected.resetAt - now);
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(retryMs / 1000)),
      };
    }

    await ctx.db.patch(selected._id, {
      count: selected.count + 1,
      updatedAt: now,
    });
    for (const row of rows) {
      if (row._id !== selected._id) {
        await ctx.db.delete(row._id);
      }
    }

    return { allowed: true };
  },
});
