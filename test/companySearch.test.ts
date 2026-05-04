import { describe, expect, test } from "bun:test";

import {
  formatCoverageState,
  getCompanyCoverageState,
  getCompanyListingLabel,
  getCompanyMarketLabel,
  getCompanySearchId,
  getCompanySearchSymbol,
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
    };

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
    };

    expect(getCompanySearchSymbol(result)).toBe("MSFT");
    expect(getCompanySearchId(result, "MSFT")).toBe("company:1");
    expect(getCompanyCoverageState(result)).toBe("valuation_ready");
  });
});
