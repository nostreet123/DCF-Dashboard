import { ConvexError, v } from "convex/values";

import { mutation } from "./_generated/server";
import { requireSyncToken } from "./syncAuth";

const validatedTtlMs = (ttlMs: number) => {
  if (!Number.isInteger(ttlMs) || ttlMs <= 0 || ttlMs > 60 * 60 * 1000) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: "ttlMs must be an integer between 1 and 3600000",
    });
  }
  return ttlMs;
};

const pruneExpiredNonces = async (ctx: any, nowMs: number) => {
  const expiredRows = await ctx.db
    .query("securityNonces")
    .withIndex("by_expiresAt", (q: any) => q.lt("expiresAt", nowMs))
    .take(25);
  await Promise.all(expiredRows.map((row: any) => ctx.db.delete(row._id)));
};

const listRowsByNonce = async (ctx: any, nonce: string) => {
  const matches = await ctx.db
    .query("securityNonces")
    .withIndex("by_nonce", (q: any) => q.eq("nonce", nonce))
    .take(2);
  if (matches.length <= 1) {
    return matches;
  }
  return await ctx.db
    .query("securityNonces")
    .withIndex("by_nonce", (q: any) => q.eq("nonce", nonce))
    .collect();
};

type NonceRow = {
  _id: any;
  nonce: string;
  status: "pending" | "used";
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
};

const newestFirst = (rows: NonceRow[]) =>
  [...rows].sort((left, right) => right.updatedAt - left.updatedAt);

export const reserveNonce = mutation({
  args: {
    syncToken: v.optional(v.string()),
    nonce: v.string(),
    ttlMs: v.number(),
    nowMs: v.optional(v.number()),
  },
  returns: v.object({
    reserved: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const ttlMs = validatedTtlMs(args.ttlMs);
    const now = args.nowMs ?? Date.now();
    await pruneExpiredNonces(ctx, now);

    const rows = (await listRowsByNonce(ctx, args.nonce)) as NonceRow[];
    const hasActive = rows.some((row) => row.expiresAt > now);
    if (hasActive) {
      return { reserved: false };
    }

    await Promise.all(rows.map((row) => ctx.db.delete(row._id)));

    await ctx.db.insert("securityNonces", {
      nonce: args.nonce,
      status: "pending",
      expiresAt: now + ttlMs,
      createdAt: now,
      updatedAt: now,
    });
    return { reserved: true };
  },
});

export const markNonceUsed = mutation({
  args: {
    syncToken: v.optional(v.string()),
    nonce: v.string(),
    ttlMs: v.number(),
    nowMs: v.optional(v.number()),
  },
  returns: v.object({
    marked: v.boolean(),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const ttlMs = validatedTtlMs(args.ttlMs);
    const now = args.nowMs ?? Date.now();
    await pruneExpiredNonces(ctx, now);

    const rows = newestFirst((await listRowsByNonce(ctx, args.nonce)) as NonceRow[]);
    const selected = rows.find(
      (row) => row.status === "pending" && row.expiresAt > now,
    );
    if (!selected) {
      return { marked: false };
    }

    await ctx.db.patch(selected._id, {
      status: "used",
      expiresAt: now + ttlMs,
      updatedAt: now,
    });

    await Promise.all(
      rows
        .filter((row) => row._id !== selected._id)
        .map((row) => ctx.db.delete(row._id)),
    );

    return { marked: true };
  },
});

export const releasePendingNonce = mutation({
  args: {
    syncToken: v.optional(v.string()),
    nonce: v.string(),
  },
  returns: v.object({
    released: v.number(),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    await pruneExpiredNonces(ctx, Date.now());

    const rows = (await listRowsByNonce(ctx, args.nonce)) as NonceRow[];
    const toDelete = rows.filter((row) => row.status === "pending");
    await Promise.all(toDelete.map((row) => ctx.db.delete(row._id)));
    return { released: toDelete.length };
  },
});
