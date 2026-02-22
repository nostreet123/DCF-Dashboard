import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { normalizePositiveIntegerLimit, normalizeSymbol } from "./normalization";
import { requireSyncToken } from "./syncAuth";

const statementValidator = v.object({
  _id: v.id("companyStatements"),
  _creationTime: v.number(),
  symbol: v.string(),
  periodEnd: v.string(),
  periodType: v.string(),
  filingDate: v.optional(v.string()),
  currency: v.optional(v.string()),
  revenue: v.optional(v.number()),
  cash: v.optional(v.number()),
  debt: v.optional(v.number()),
  sharesOutstanding: v.optional(v.number()),
  source: v.string(),
  updatedAt: v.number(),
});

const normalizeLimit = (requested: number | undefined) =>
  normalizePositiveIntegerLimit(requested, 20, 100);

const MAX_BATCH = 100;

export const listBySymbol = query({
  args: {
    symbol: v.string(),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  returns: v.object({
    statements: v.array(statementValidator),
    nextCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const symbol = normalizeSymbol(args.symbol);
    const limit = normalizeLimit(args.limit);
    const result = await ctx.db
      .query("companyStatements")
      .withIndex("by_symbol_and_periodEnd", (q: any) => q.eq("symbol", symbol))
      .order("desc")
      .paginate({
        cursor: args.cursor ?? null,
        numItems: limit,
      });
    return {
      statements: result.page,
      nextCursor: result.continueCursor ?? null,
    };
  },
});

export const upsertBatch = mutation({
  args: {
    syncToken: v.optional(v.string()),
    symbol: v.string(),
    statements: v.array(
      v.object({
        periodEnd: v.string(),
        periodType: v.string(),
        filingDate: v.optional(v.string()),
        currency: v.optional(v.string()),
        revenue: v.optional(v.number()),
        cash: v.optional(v.number()),
        debt: v.optional(v.number()),
        sharesOutstanding: v.optional(v.number()),
        source: v.string(),
        updatedAt: v.optional(v.number()),
      }),
    ),
  },
  returns: v.object({
    created: v.number(),
    updated: v.number(),
  }),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    if (args.statements.length > MAX_BATCH) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: `Batch too large: max ${MAX_BATCH} statements per call`,
      });
    }
    const symbol = normalizeSymbol(args.symbol);

    let created = 0;
    let updated = 0;
    for (const statement of args.statements) {
      const existing = await ctx.db
        .query("companyStatements")
        .withIndex("by_symbol_and_periodEnd", (q: any) =>
          q.eq("symbol", symbol).eq("periodEnd", statement.periodEnd),
        )
        .unique();
      const updatedAt = statement.updatedAt ?? Date.now();

      const update: Record<string, unknown> = {
        periodType: statement.periodType,
        source: statement.source,
        updatedAt,
      };
      if (statement.filingDate !== undefined) {
        update.filingDate = statement.filingDate;
      }
      if (statement.currency !== undefined) {
        update.currency = statement.currency;
      }
      if (statement.revenue !== undefined) {
        update.revenue = statement.revenue;
      }
      if (statement.cash !== undefined) {
        update.cash = statement.cash;
      }
      if (statement.debt !== undefined) {
        update.debt = statement.debt;
      }
      if (statement.sharesOutstanding !== undefined) {
        update.sharesOutstanding = statement.sharesOutstanding;
      }

      if (existing) {
        await ctx.db.patch(existing._id, update);
        updated += 1;
        continue;
      }

      await ctx.db.insert("companyStatements", {
        symbol,
        periodEnd: statement.periodEnd,
        periodType: statement.periodType,
        filingDate: statement.filingDate,
        currency: statement.currency,
        revenue: statement.revenue,
        cash: statement.cash,
        debt: statement.debt,
        sharesOutstanding: statement.sharesOutstanding,
        source: statement.source,
        updatedAt,
      });
      created += 1;
    }

    return { created, updated };
  },
});
