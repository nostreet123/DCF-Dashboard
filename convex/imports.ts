import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { normalizeOptionalSymbol, normalizePositiveIntegerLimit } from "./normalization";
import { requireSyncToken } from "./syncAuth";

const ImportedArtifactKind = v.union(
  v.literal("incomeStatement"),
  v.literal("balanceSheet"),
  v.literal("cashFlow"),
  v.literal("sharesMeta"),
);

const ImportedArtifactStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
);

const CoverageState = v.union(
  v.literal("valuation_ready"),
  v.literal("import_required"),
  v.literal("detail_only"),
);

const JsonObject = v.record(v.string(), v.any());

const sourceLinkValidator = v.object({
  title: v.string(),
  url: v.string(),
});

const artifactValidator = v.object({
  _id: v.id("importArtifacts"),
  _creationTime: v.number(),
  listingId: v.string(),
  artifactId: v.string(),
  kind: ImportedArtifactKind,
  status: ImportedArtifactStatus,
  originalFilename: v.string(),
  parserName: v.string(),
  fileFormat: v.string(),
  contentType: v.optional(v.string()),
  byteSize: v.number(),
  storageId: v.optional(v.id("_storage")),
  parseResult: v.optional(JsonObject),
  createdAt: v.number(),
  approvedAt: v.optional(v.number()),
});

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
  coverageState: CoverageState,
  filingCurrency: v.optional(v.string()),
  facts: JsonObject,
  review: JsonObject,
  provenance: JsonObject,
  sourceLinks: v.array(sourceLinkValidator),
  artifactIds: v.array(v.string()),
  approvedAt: v.number(),
  updatedAt: v.number(),
});

const normalizeLimit = (requested: number | undefined) =>
  normalizePositiveIntegerLimit(requested, 20, 100);

export const generateUploadUrl = mutation({
  args: {
    syncToken: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    return ctx.storage.generateUploadUrl();
  },
});

export const saveParsedArtifact = mutation({
  args: {
    syncToken: v.optional(v.string()),
    listingId: v.string(),
    artifactId: v.string(),
    kind: ImportedArtifactKind,
    originalFilename: v.string(),
    parserName: v.string(),
    fileFormat: v.string(),
    contentType: v.optional(v.string()),
    byteSize: v.number(),
    storageId: v.optional(v.id("_storage")),
    parseResult: v.optional(JsonObject),
  },
  returns: v.id("importArtifacts"),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const existing = await ctx.db
      .query("importArtifacts")
      .withIndex("by_artifactId", (q: any) => q.eq("artifactId", args.artifactId))
      .unique();
    const patch = {
      listingId: args.listingId,
      kind: args.kind,
      status: "pending" as const,
      originalFilename: args.originalFilename,
      parserName: args.parserName,
      fileFormat: args.fileFormat,
      contentType: args.contentType,
      byteSize: args.byteSize,
      storageId: args.storageId,
      parseResult: args.parseResult,
      createdAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return ctx.db.insert("importArtifacts", {
      artifactId: args.artifactId,
      ...patch,
    });
  },
});

export const approveImportedFacts = mutation({
  args: {
    syncToken: v.optional(v.string()),
    listingId: v.string(),
    symbol: v.string(),
    name: v.string(),
    exchangeMic: v.optional(v.string()),
    market: v.optional(v.string()),
    country: v.optional(v.string()),
    currency: v.optional(v.string()),
    coverageState: CoverageState,
    filingCurrency: v.optional(v.string()),
    facts: JsonObject,
    review: JsonObject,
    provenance: JsonObject,
    sourceLinks: v.array(sourceLinkValidator),
    artifactIds: v.array(v.string()),
  },
  returns: v.id("importedFacts"),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const symbol = normalizeOptionalSymbol(args.symbol);
    if (!symbol) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Symbol is required" });
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("importedFacts")
      .withIndex("by_listingId", (q: any) => q.eq("listingId", args.listingId))
      .unique();
    const doc = {
      listingId: args.listingId,
      symbol,
      name: args.name,
      exchangeMic: args.exchangeMic,
      market: args.market,
      country: args.country,
      currency: args.currency,
      coverageState: args.coverageState,
      filingCurrency: args.filingCurrency,
      facts: args.facts,
      review: args.review,
      provenance: args.provenance,
      sourceLinks: args.sourceLinks,
      artifactIds: args.artifactIds,
      approvedAt: now,
      updatedAt: now,
    };
    for (const artifactId of args.artifactIds) {
      const artifact = await ctx.db
        .query("importArtifacts")
        .withIndex("by_artifactId", (q: any) => q.eq("artifactId", artifactId))
        .unique();
      if (artifact) {
        await ctx.db.patch(artifact._id, { status: "approved", approvedAt: now });
      }
    }
    if (existing) {
      await ctx.db.patch(existing._id, doc);
      return existing._id;
    }
    return ctx.db.insert("importedFacts", doc);
  },
});

export const getImportedFacts = query({
  args: {
    syncToken: v.optional(v.string()),
    listingId: v.string(),
  },
  returns: v.union(v.null(), importedFactsValidator),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const listingId = args.listingId.trim();
    if (!listingId) {
      return null;
    }

    return ctx.db
      .query("importedFacts")
      .withIndex("by_listingId_updatedAt", (q: any) => q.eq("listingId", listingId))
      .filter((q) => q.eq(q.field("coverageState"), "valuation_ready"))
      .order("desc")
      .first();
  },
});

export const listBySymbol = query({
  args: {
    syncToken: v.optional(v.string()),
    symbol: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(importedFactsValidator),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const symbol = normalizeOptionalSymbol(args.symbol);
    if (!symbol) {
      return [];
    }
    return ctx.db
      .query("importedFacts")
      .withIndex("by_symbol_updatedAt", (q: any) => q.eq("symbol", symbol))
      .filter((q) => q.eq(q.field("coverageState"), "valuation_ready"))
      .order("desc")
      .take(normalizeLimit(args.limit));
  },
});

export const listArtifactsForListing = query({
  args: {
    syncToken: v.optional(v.string()),
    listingId: v.string(),
    status: v.optional(ImportedArtifactStatus),
    limit: v.optional(v.number()),
  },
  returns: v.array(artifactValidator),
  handler: async (ctx, args) => {
    requireSyncToken(args.syncToken);
    const limit = normalizeLimit(args.limit);
    if (args.status) {
      return ctx.db
        .query("importArtifacts")
        .withIndex("by_listingId_status", (q: any) =>
          q.eq("listingId", args.listingId).eq("status", args.status),
        )
        .order("desc")
        .take(limit);
    }
    return ctx.db
      .query("importArtifacts")
      .withIndex("by_listingId_createdAt", (q: any) => q.eq("listingId", args.listingId))
      .order("desc")
      .take(limit);
  },
});
