import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { requireSyncToken } from "./syncAuth";

const companyValidator = v.object({
  _id: v.id("companies"),
  _creationTime: v.number(),
  symbol: v.string(),
  name: v.optional(v.string()),
  cik: v.optional(v.string()),
  country: v.optional(v.string()),
  currency: v.optional(v.string()),
  source: v.string(),
  updatedAt: v.number(),
});

const normalizeSymbol = (symbol: string) => symbol.trim().toUpperCase();

const normalizeLimit = (requested: number | undefined) => {
  const DEFAULT_LIMIT = 20;
  const MAX_LIMIT = 50;
  if (requested === undefined) {
    return DEFAULT_LIMIT;
  }
  const limit = Number(requested);
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: "Limit must be a positive integer",
    });
  }
  return Math.min(limit, MAX_LIMIT);
};

export const get = query({
  args: {
    symbol: v.string(),
  },
  returns: v.union(v.null(), companyValidator),
  handler: async (ctx, args) => {
    const symbol = normalizeSymbol(args.symbol);
    return ctx.db
      .query("companies")
      .withIndex("by_symbol", (q: any) => q.eq("symbol", symbol))
      .unique();
  },
});

export const search = query({
  args: {
    q: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(companyValidator),
  handler: async (ctx, args) => {
    const raw = args.q.trim();
    if (!raw) {
      return [];
    }
    const limit = normalizeLimit(args.limit);
    const symbolQuery = raw.toUpperCase();
    const nameQuery = raw.toLowerCase();
    const PAGE_SIZE = 200;
    const MAX_SCAN = 1000;

    const matches: any[] = [];
    let cursor: string | null = null;
    let scanned = 0;

    while (matches.length < limit && scanned < MAX_SCAN) {
      const result = await ctx.db
        .query("companies")
        .withIndex("by_symbol", (q: any) => q)
        .order("asc")
        .paginate({
          cursor,
          numItems: PAGE_SIZE,
        });

      const page = result.page as any[];
      if (page.length === 0) {
        break;
      }
      scanned += page.length;

      for (const company of page) {
        if (company.symbol.includes(symbolQuery)) {
          matches.push(company);
          if (matches.length >= limit) {
            break;
          }
          continue;
        }
        if (company.name && company.name.toLowerCase().includes(nameQuery)) {
          matches.push(company);
          if (matches.length >= limit) {
            break;
          }
        }
      }

      if (!result.continueCursor) {
        break;
      }
      cursor = result.continueCursor;
    }

    return matches;
  },
});

export const upsertCompany = mutation({
  args: {
    syncToken: v.optional(v.string()),
    symbol: v.string(),
    name: v.optional(v.string()),
    cik: v.optional(v.string()),
    country: v.optional(v.string()),
    currency: v.optional(v.string()),
    source: v.string(),
    updatedAt: v.optional(v.number()),
  },
  returns: v.object({
    companyId: v.id("companies"),
    action: v.union(v.literal("created"), v.literal("updated")),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const symbol = normalizeSymbol(args.symbol);
    const updatedAt = args.updatedAt ?? Date.now();
    const existing = await ctx.db
      .query("companies")
      .withIndex("by_symbol", (q: any) => q.eq("symbol", symbol))
      .unique();

    const patch: Record<string, unknown> = {
      source: args.source,
      updatedAt,
    };
    if (args.name !== undefined) {
      patch.name = args.name;
    }
    if (args.cik !== undefined) {
      patch.cik = args.cik;
    }
    if (args.country !== undefined) {
      patch.country = args.country;
    }
    if (args.currency !== undefined) {
      patch.currency = args.currency;
    }

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return { companyId: existing._id, action: "updated" as const };
    }

    const companyId = await ctx.db.insert("companies", {
      symbol,
      name: args.name,
      cik: args.cik,
      country: args.country,
      currency: args.currency,
      source: args.source,
      updatedAt,
    });
    return { companyId, action: "created" as const };
  },
});
