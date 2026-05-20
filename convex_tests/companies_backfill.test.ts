/// <reference types="bun-types" />
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { backfillSearchTextPage } from "../convex/companies";

const SYNC_TOKEN = "test-sync-token";

describe("backfillSearchTextPage", () => {
  const originalSyncToken = process.env.DAMODARAN_SYNC_TOKEN;

  beforeEach(() => {
    process.env.DAMODARAN_SYNC_TOKEN = SYNC_TOKEN;
  });

  afterEach(() => {
    process.env.DAMODARAN_SYNC_TOKEN = originalSyncToken;
  });

  test("identifies and patches companies needing backfill", async () => {
    const companies = [
      {
        _id: "c1",
        symbol: "AAPL",
        name: "Apple Inc.",
        searchText: "aapl apple inc.", // Up to date
      },
      {
        _id: "c2",
        symbol: "MSFT",
        name: "Microsoft",
        searchText: "old", // Stale
      },
      {
        _id: "c3",
        symbol: "GOOGL",
        name: "Alphabet",
        // searchText missing
      },
    ];

    const patches: any[] = [];
    const mockDb = {
      query: () => ({
        withIndex: () => ({
          paginate: async () => ({
            page: companies,
            continueCursor: null,
          }),
        }),
      }),
      patch: async (id: any, patch: any) => {
        patches.push({ id, patch });
      },
    };

    const ctx = { db: mockDb as any };
    const result = await (backfillSearchTextPage as any).handler(ctx, {
      syncToken: SYNC_TOKEN,
    });

    expect(result.processed).toBe(3);
    expect(result.updated).toBe(2);
    expect(patches).toHaveLength(2);
    expect(patches[0]).toEqual({
      id: "c2",
      patch: { searchText: "msft microsoft" },
    });
    expect(patches[1]).toEqual({
      id: "c3",
      patch: { searchText: "googl alphabet" },
    });
  });
});
