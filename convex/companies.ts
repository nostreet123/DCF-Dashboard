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
    const unique = new Map<string, any>();

    // Fast path: prefix match on symbol via index range scan.
    const symbolMatches = await ctx.db
      .query("companies")
      .withIndex("by_symbol", (q: any) =>
        q.gte("symbol", symbolQuery).lt("symbol", `${symbolQuery}\uffff`),
      )
      .order("asc")
      .take(limit);
    for (const company of symbolMatches as any[]) {
      unique.set(company.symbol, company);
    }

    const remaining = limit - unique.size;
    if (remaining <= 0) {
      return Array.from(unique.values()).slice(0, limit);
    }

    // Name search uses a search index to avoid paginating/scanning in a loop.
    const nameMatches = await ctx.db
      .query("companies")
      .withSearchIndex("search_name", (q: any) => q.search("name", raw))
      .take(Math.min(200, remaining * 4));
    for (const company of nameMatches as any[]) {
      if (!unique.has(company.symbol)) {
        unique.set(company.symbol, company);
        if (unique.size >= limit) {
          break;
        }
      }
    }

    return Array.from(unique.values()).slice(0, limit);
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
      ...(args.name !== undefined ? { name: args.name } : {}),
      ...(args.cik !== undefined ? { cik: args.cik } : {}),
      ...(args.country !== undefined ? { country: args.country } : {}),
      ...(args.currency !== undefined ? { currency: args.currency } : {}),
      source: args.source,
      updatedAt,
    });
    return { companyId, action: "created" as const };
  },
});
