import { describe, expect, test } from "bun:test";

import {
  formatCoverageState,
  getBestValuationSearchResult,
  getCompanyCoverageState,
  getCompanyListingLabel,
  getCompanyMarketLabel,
  getCompanySearchId,
  getCompanySearchSymbol,
  type CompanySearchResult,
} from "../lib/companySearch";

describe("company search result helpers", () => {
  test("normalizes exchange-aware SEC search fields", () => {
    const result = {
      symbol: "AAPL",
      name: "Apple Inc.",
      listing_id: "XNAS:AAPL",
      exchange: "Nasdaq",
      mic: "XNAS",
      coverage_state: "valuation_ready" as const,
    } as CompanySearchResult;

    expect(getCompanySearchSymbol(result)).toBe("AAPL");
    expect(getCompanySearchId(result, "AAPL")).toBe("XNAS:AAPL");
    expect(getCompanyListingLabel(result)).toBe("XNAS:AAPL");
    expect(getCompanyMarketLabel(result)).toBe("Nasdaq");
    expect(getCompanyCoverageState(result)).toBe("valuation_ready");
    expect(formatCoverageState("valuation_ready")).toBe("Valuation ready");
  });

  test("falls back to legacy Convex result shape", () => {
    const result = {
      _id: "company:1",
      ticker: "MSFT",
      name: "Microsoft Corp.",
    } as CompanySearchResult;

    expect(getCompanySearchSymbol(result)).toBe("MSFT");
    expect(getCompanySearchId(result, "MSFT")).toBe("company:1");
    expect(getCompanyCoverageState(result)).toBe("valuation_ready");
  });

  test("prefers valuation-ready results over search-only matches", () => {
    const results = [
      {
        symbol: "MIXL",
        name: "Mixed Search Only Ltd.",
        coverage_state: "search_only" as const,
      },
      {
        symbol: "MSFT",
        name: "Microsoft Corp.",
        coverage_state: "valuation_ready" as const,
      },
    ] as CompanySearchResult[];

    expect(getBestValuationSearchResult(results)?.symbol).toBe("MSFT");
  });

  test("falls back to the first match when none are valuation-ready", () => {
    const results = [
      {
        symbol: "MIXL",
        name: "Mixed Search Only Ltd.",
        coverage_state: "search_only" as const,
      },
    ] as CompanySearchResult[];

    expect(getBestValuationSearchResult(results)?.symbol).toBe("MIXL");
  });
});
