import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { requireSyncToken } from "./syncAuth";

type CompanyBackfillCandidate = {
  symbol: string;
  name?: string;
  cik?: string;
  searchText?: string;
};

const companyValidator = v.object({
  _id: v.id("companies"),
  _creationTime: v.number(),
  symbol: v.string(),
  name: v.optional(v.string()),
  cik: v.optional(v.string()),
  searchText: v.optional(v.string()),
  country: v.optional(v.string()),
  currency: v.optional(v.string()),
  source: v.string(),
  updatedAt: v.number(),
});

const normalizeSymbol = (symbol: string) => symbol.trim().toUpperCase();

export const buildSearchText = (
  symbol: string,
  name: string | undefined,
  cik: string | undefined,
) => {
  const parts = [symbol.toLowerCase()];
  const trimmedName = name?.trim();
  if (trimmedName) {
    parts.push(trimmedName.toLowerCase());
  }
  const trimmedCik = cik?.trim();
  if (trimmedCik) {
    parts.push(trimmedCik);
  }
  return parts.join(" ");
};

export const mergeCompanySearchResults = <T extends { _id: unknown }>(
  symbolMatches: T[],
  textMatches: T[],
  limit: number,
) => {
  const merged: T[] = [];
  const seen = new Set<string>();
  const appendUniqueCompanies = (candidates: T[]) => {
    for (const company of candidates) {
      const key = String(company._id);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(company);
      if (merged.length >= limit) {
        break;
      }
    }
  };

  appendUniqueCompanies(symbolMatches);
  if (merged.length < limit) {
    appendUniqueCompanies(textMatches);
  }
  return merged;
};

export const getCompanyBackfillPatch = (company: CompanyBackfillCandidate) => {
  const expected = buildSearchText(company.symbol, company.name, company.cik);
  if (company.searchText === expected) {
    return null;
  }
  return { searchText: expected };
};

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

const normalizeBackfillLimit = (requested: number | undefined) => {
  const DEFAULT_LIMIT = 200;
  const MAX_LIMIT = 500;
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
    const textQuery = raw.toLowerCase();

    const symbolMatches = await ctx.db
      .query("companies")
      .withIndex("by_symbol", (q: any) =>
        q.gte("symbol", symbolQuery).lt("symbol", `${symbolQuery}\uffff`),
      )
      .take(limit);
    const textMatches = await ctx.db
      .query("companies")
      .withSearchIndex("search_text", (q: any) =>
        q.search("searchText", textQuery),
      )
      .take(limit);

    return mergeCompanySearchResults(symbolMatches, textMatches, limit);
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
    const name = args.name ?? existing?.name;
    const cik = args.cik ?? existing?.cik;
    const searchText = buildSearchText(symbol, name, cik);

    const patch: Record<string, unknown> = {
      source: args.source,
      updatedAt,
      searchText,
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
      searchText,
      ...(args.country !== undefined ? { country: args.country } : {}),
      ...(args.currency !== undefined ? { currency: args.currency } : {}),
      source: args.source,
      updatedAt,
    });
    return { companyId, action: "created" as const };
  },
});

export const backfillSearchTextPage = mutation({
  args: {
    syncToken: v.optional(v.string()),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    processed: v.number(),
    updated: v.number(),
    nextCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const limit = normalizeBackfillLimit(args.limit);
    const result = await ctx.db
      .query("companies")
      .withIndex("by_symbol", (q: any) => q)
      .paginate({
        cursor: args.cursor ?? null,
        numItems: limit,
      });

    let updated = 0;
    for (const company of result.page as any[]) {
      const patch = getCompanyBackfillPatch(company);
      if (!patch) {
        continue;
      }
      await ctx.db.patch(company._id, patch);
      updated += 1;
    }

    return {
      processed: result.page.length,
      updated,
      nextCursor: result.continueCursor ?? null,
    };
  },
});
