import { describe, expect, test } from "bun:test";
import {
  buildSearchText,
  getCompanyBackfillPatch,
  mergeCompanySearchResults,
} from "../convex/companies";

describe("companies search merge", () => {
  test("prioritizes symbol matches and deduplicates text matches", () => {
    const symbolMatches = [
      { _id: "c1", symbol: "AAPL", name: "Apple Inc.", searchText: "aapl apple inc." },
      { _id: "c2", symbol: "AAPB", name: "Alpha Beta", searchText: "aapb alpha beta" },
    ];
    const textMatches = [
      { _id: "c2", symbol: "AAPB", name: "Alpha Beta", searchText: "aapb alpha beta" },
      { _id: "c3", symbol: "MSFT", name: "Microsoft", searchText: "msft microsoft" },
    ];

    const merged = mergeCompanySearchResults(symbolMatches, textMatches, 5);
    expect(merged.map((c) => c._id)).toEqual(["c1", "c2", "c3"]);
  });

  test("respects limit when merging", () => {
    const symbolMatches = [
      { _id: "c1", symbol: "AAPL" },
      { _id: "c2", symbol: "AAPB" },
    ];
    const textMatches = [
      { _id: "c3", symbol: "MSFT" },
      { _id: "c4", symbol: "NVDA" },
    ];

    const merged = mergeCompanySearchResults(symbolMatches, textMatches, 3);
    expect(merged.map((c) => c._id)).toEqual(["c1", "c2", "c3"]);
  });
});

describe("companies backfill patch", () => {
  test("buildSearchText normalizes symbol/name/cik", () => {
    const text = buildSearchText("AAPL", " Apple Inc. ", " 0000320193 ");
    expect(text).toBe("aapl apple inc. 0000320193");
  });

  test("returns patch when searchText is missing or stale", () => {
    const patch = getCompanyBackfillPatch({
      _id: "c1",
      symbol: "AAPL",
      name: "Apple Inc.",
      cik: "0000320193",
    });
    expect(patch).toEqual({ searchText: "aapl apple inc. 0000320193" });
  });

  test("returns null when row already has expected searchText", () => {
    const patch = getCompanyBackfillPatch({
      _id: "c1",
      symbol: "AAPL",
      name: "Apple Inc.",
      cik: "0000320193",
      searchText: "aapl apple inc. 0000320193",
    });
    expect(patch).toBeNull();
  });
});
