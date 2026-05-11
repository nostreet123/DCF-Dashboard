/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const TEST_SYNC_TOKEN = "test-sync-token";
const originalSyncToken = process.env.DAMODARAN_SYNC_TOKEN;

const modules: Record<string, () => Promise<any>> = {};
const glob = new Bun.Glob("**/*.ts");
const convexDir = `${import.meta.dir}/../convex`;
for (const entry of glob.scanSync({ cwd: convexDir, absolute: false })) {
  const key = `../convex/${entry}`;
  const fullPath = `${convexDir}/${entry}`;
  modules[key] = () => import(fullPath);
}

const makeImportedFacts = (overrides: Record<string, unknown> = {}) => ({
  listingId: "XLON:VOD",
  symbol: "VOD",
  name: "Vodafone Group Public Limited Company",
  exchangeMic: "XLON",
  market: "London Stock Exchange",
  country: "GB",
  currency: "GBP",
  coverageState: "valuation_ready" as const,
  filingCurrency: "GBP",
  facts: {
    statements: [
      {
        period_end: "2025-03-31",
        period_type: "FY",
        revenue: 37_448_000_000,
        shares_outstanding: 24_100_000_000,
      },
    ],
  },
  review: {},
  provenance: {},
  sourceLinks: [],
  artifactIds: [],
  approvedAt: 1_000,
  updatedAt: 1_000,
  ...overrides,
});

describe("imports queries", () => {
  beforeEach(() => {
    process.env.DAMODARAN_SYNC_TOKEN = TEST_SYNC_TOKEN;
  });

  afterEach(() => {
    if (originalSyncToken === undefined) {
      delete process.env.DAMODARAN_SYNC_TOKEN;
    } else {
      process.env.DAMODARAN_SYNC_TOKEN = originalSyncToken;
    }
  });

  test("getImportedFacts returns latest imported facts for listing", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await ctx.db.insert("importedFacts", makeImportedFacts({ updatedAt: 1_000 }));
      await ctx.db.insert(
        "importedFacts",
        makeImportedFacts({
          facts: { statements: [{ period_end: "2026-03-31", revenue: 2 }] },
          updatedAt: 2_000,
        }),
      );
      await ctx.db.insert(
        "importedFacts",
        makeImportedFacts({ listingId: "XTKS:7203", symbol: "7203", updatedAt: 3_000 }),
      );
    });

    const result = await t.query(api.imports.getImportedFacts, {
      syncToken: TEST_SYNC_TOKEN,
      listingId: "XLON:VOD",
    });

    expect(result?.listingId).toBe("XLON:VOD");
    expect(result?.updatedAt).toBe(2_000);
    expect(result?.facts.statements).toEqual([{ period_end: "2026-03-31", revenue: 2 }]);
  });

  test("getImportedFacts skips newer non-ready imports for listing", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await ctx.db.insert("importedFacts", makeImportedFacts({ updatedAt: 1_000 }));
      await ctx.db.insert(
        "importedFacts",
        makeImportedFacts({
          coverageState: "import_required",
          facts: { statements: [{ period_end: "2026-03-31", revenue: 2 }] },
          updatedAt: 2_000,
        }),
      );
    });

    const result = await t.query(api.imports.getImportedFacts, {
      syncToken: TEST_SYNC_TOKEN,
      listingId: "XLON:VOD",
    });

    expect(result?.coverageState).toBe("valuation_ready");
    expect(result?.updatedAt).toBe(1_000);
  });

  test("getImportedFacts returns null for blank or missing listings", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await ctx.db.insert("importedFacts", makeImportedFacts());
    });

    await expect(
      t.query(api.imports.getImportedFacts, { syncToken: TEST_SYNC_TOKEN, listingId: "   " }),
    ).resolves.toBeNull();
    await expect(
      t.query(api.imports.getImportedFacts, { syncToken: TEST_SYNC_TOKEN, listingId: "XTKS:7203" }),
    ).resolves.toBeNull();
  });

  test("getImportedFacts rejects missing or invalid sync token", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await ctx.db.insert("importedFacts", makeImportedFacts());
    });

    await expect(
      t.query(api.imports.getImportedFacts, { listingId: "XLON:VOD" }),
    ).rejects.toThrow("Invalid sync token");
    await expect(
      t.query(api.imports.getImportedFacts, {
        syncToken: "wrong-token",
        listingId: "XLON:VOD",
      }),
    ).rejects.toThrow("Invalid sync token");
  });

  test("listBySymbol returns only valuation-ready imports", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await ctx.db.insert("importedFacts", makeImportedFacts({ updatedAt: 1_000 }));
      await ctx.db.insert(
        "importedFacts",
        makeImportedFacts({
          coverageState: "detail_only",
          updatedAt: 2_000,
        }),
      );
    });

    const results = await t.query(api.imports.listBySymbol, {
      syncToken: TEST_SYNC_TOKEN,
      symbol: "VOD",
      limit: 5,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.coverageState).toBe("valuation_ready");
    expect(results[0]?.updatedAt).toBe(1_000);
  });
});
