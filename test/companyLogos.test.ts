import { describe, expect, test } from "bun:test";

import { getCompanyLogoUrl, normalizeLogoSymbol } from "../lib/companyLogos";

describe("company logo helpers", () => {
  test("builds an eager ticker logo url for common symbols", () => {
    expect(getCompanyLogoUrl("aapl")).toBe(
      "https://financialmodelingprep.com/image-stock/AAPL.png",
    );
  });

  test("normalizes class tickers for the logo provider", () => {
    expect(normalizeLogoSymbol("brk.a")).toBe("BRK-A");
    expect(getCompanyLogoUrl("BRK.B")).toBe(
      "https://financialmodelingprep.com/image-stock/BRK-B.png",
    );
  });

  test("rejects unsafe symbol text", () => {
    expect(getCompanyLogoUrl("AAPL/../../x")).toBeNull();
  });
});
