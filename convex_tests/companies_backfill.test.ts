/// <reference types="bun-types" />
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const SYNC_TOKEN = "test-sync-token";

const modules: Record<string, () => Promise<any>> = {};
const glob = new Bun.Glob("**/*.ts");
const convexDir = `${import.meta.dir}/../convex`;
for (const entry of glob.scanSync({ cwd: convexDir, absolute: false })) {
  const key = `../convex/${entry}`;
  const fullPath = `${convexDir}/${entry}`;
  modules[key] = () => import(fullPath);
}

describe("backfillSearchTextPage", () => {
  const originalSyncToken = process.env.DAMODARAN_SYNC_TOKEN;

  beforeEach(() => {
    process.env.DAMODARAN_SYNC_TOKEN = SYNC_TOKEN;
  });

  afterEach(() => {
    if (originalSyncToken === undefined) {
      delete process.env.DAMODARAN_SYNC_TOKEN;
    } else {
      process.env.DAMODARAN_SYNC_TOKEN = originalSyncToken;
    }
  });

  test("identifies and patches companies needing backfill", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await ctx.db.insert("companies", {
        symbol: "AAPL",
        name: "Apple Inc.",
        searchText: "aapl apple inc.",
        source: "test",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("companies", {
        symbol: "MSFT",
        name: "Microsoft",
        searchText: "old",
        source: "test",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("companies", {
        symbol: "GOOGL",
        name: "Alphabet",
        source: "test",
        updatedAt: Date.now(),
      });
    });

    const result = await t.mutation(api.companies.backfillSearchTextPage, {
      syncToken: SYNC_TOKEN,
    });

    expect(result.processed).toBe(3);
    expect(result.updated).toBe(2);
    const companies = await t.run(async (ctx) => {
      return await ctx.db.query("companies").withIndex("by_symbol").collect();
    });

    expect(
      companies.map((company) => ({
        symbol: company.symbol,
        searchText: company.searchText,
      })),
    ).toEqual([
      { symbol: "AAPL", searchText: "aapl apple inc." },
      { symbol: "GOOGL", searchText: "googl alphabet" },
      { symbol: "MSFT", searchText: "msft microsoft" },
    ]);
  });
});
