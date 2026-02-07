import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { executeCompanySearch } from "../app/api/company/search/logic.ts";

describe("executeCompanySearch", () => {
  it("returns Convex results when available", async () => {
    const outcome = await executeCompanySearch({
      q: "aapl",
      limit: 5,
      hasEdgar: true,
      searchConvex: async () => [
        { symbol: "AAPL", name: "Apple Inc.", cik: "0000320193" },
      ],
      searchEdgar: async () => {
        throw new Error("EDGAR should not be called");
      },
    });

    assert.equal(outcome.ok, true);
    if (!outcome.ok) {
      return;
    }
    assert.equal(outcome.data.source, "convex");
    assert.equal(outcome.data.results.length, 1);
  });

  it("falls back to EDGAR when Convex returns empty", async () => {
    const outcome = await executeCompanySearch({
      q: "msft",
      limit: 5,
      hasEdgar: true,
      searchConvex: async () => [],
      searchEdgar: async () => [
        { symbol: "MSFT", name: "Microsoft", cik: "0000789019" },
      ],
    });

    assert.equal(outcome.ok, true);
    if (!outcome.ok) {
      return;
    }
    assert.equal(outcome.data.source, "edgar");
    assert.equal(outcome.data.results[0].symbol, "MSFT");
  });

  it("falls back to EDGAR when Convex throws", async () => {
    const outcome = await executeCompanySearch({
      q: "nvda",
      limit: 5,
      hasEdgar: true,
      searchConvex: async () => {
        throw new Error("convex unavailable");
      },
      searchEdgar: async () => [
        { symbol: "NVDA", name: "NVIDIA", cik: "0001045810" },
      ],
    });

    assert.equal(outcome.ok, true);
    if (!outcome.ok) {
      return;
    }
    assert.equal(outcome.data.source, "edgar");
    assert.equal(outcome.data.results[0].symbol, "NVDA");
  });

  it("returns CONVEX_ERROR when Convex fails and EDGAR is disabled", async () => {
    const outcome = await executeCompanySearch({
      q: "amzn",
      limit: 5,
      hasEdgar: false,
      searchConvex: async () => {
        throw new Error("convex unavailable");
      },
      searchEdgar: async () => [],
    });

    assert.equal(outcome.ok, false);
    if (outcome.ok) {
      return;
    }
    assert.equal(outcome.error.code, "CONVEX_ERROR");
    assert.equal(outcome.error.status, 500);
  });
});
