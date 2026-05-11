import { query } from "./_generated/server";
import { v } from "convex/values";

const importedFactsValidator = v.object({
  _id: v.id("importedFacts"),
  _creationTime: v.number(),
  listingId: v.string(),
  symbol: v.string(),
  name: v.string(),
  exchangeMic: v.optional(v.string()),
  market: v.optional(v.string()),
  country: v.optional(v.string()),
  currency: v.optional(v.string()),
  coverageState: v.union(
    v.literal("valuation_ready"),
    v.literal("import_required"),
    v.literal("detail_only"),
  ),
  filingCurrency: v.optional(v.string()),
  facts: v.record(v.string(), v.any()),
  review: v.record(v.string(), v.any()),
  provenance: v.record(v.string(), v.any()),
  sourceLinks: v.array(v.object({ title: v.string(), url: v.string() })),
  artifactIds: v.array(v.string()),
  approvedAt: v.number(),
  updatedAt: v.number(),
});

export const getImportedFacts = query({
  args: {
    listingId: v.string(),
  },
  returns: v.union(v.null(), importedFactsValidator),
  handler: async (ctx, args) => {
    const listingId = args.listingId.trim();
    if (!listingId) {
      return null;
    }

    return ctx.db
      .query("importedFacts")
      .withIndex("by_listingId_updatedAt", (q: any) =>
        q.eq("listingId", listingId),
      )
      .filter((q) => q.eq(q.field("coverageState"), "valuation_ready"))
      .order("desc")
      .first();
  },
});
