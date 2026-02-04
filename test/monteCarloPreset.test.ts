import assert from "node:assert/strict";
import { describe, test } from "bun:test";
import { parseMonteCarloPreset, sanitizePayload } from "../app/api/_lib/monteCarloPreset.ts";

describe("monteCarloPreset", () => {
  test("returns off when mc param is missing", () => {
    const request = new Request("http://localhost/api/dcf/preview");
    const payload = { requestId: "abc" };
    const result = parseMonteCarloPreset(request, payload);
    assert.equal(result.preset, "off");
    assert.equal(result.monteCarlo, undefined);
  });

  test("supports mc=off explicitly", () => {
    const request = new Request("http://localhost/api/dcf/preview?mc=off");
    const payload = { requestId: "abc" };
    const result = parseMonteCarloPreset(request, payload);
    assert.equal(result.preset, "off");
    assert.equal(result.monteCarlo, undefined);
  });

  test("rejects invalid mc values", () => {
    const request = new Request("http://localhost/api/dcf/preview?mc=banana");
    const payload = { requestId: "abc" };
    assert.throws(() => parseMonteCarloPreset(request, payload), /Invalid mc parameter/);
  });

  test("maps presets to runs/bins and derives seed from valuation inputs", () => {
    const request = new Request("http://localhost/api/dcf/preview?mc=default");
    const payload = {
      requestId: "req-123",
      symbol: "AAPL",
      base: {
        revenueGrowth: 0.05,
        ebitMargin: 0.2,
        taxRate: 0.25,
        salesToCapital: 1.8,
        wacc: 0.09,
        gStable: 0.03,
        waccStable: 0.08,
      },
      bull: {
        revenueGrowth: 0.07,
        ebitMargin: 0.22,
        taxRate: 0.24,
        salesToCapital: 1.9,
        wacc: 0.085,
        gStable: 0.032,
        waccStable: 0.082,
      },
      bear: {
        revenueGrowth: 0.03,
        ebitMargin: 0.18,
        taxRate: 0.27,
        salesToCapital: 1.6,
        wacc: 0.1,
        gStable: 0.028,
        waccStable: 0.09,
      },
      revenueT0: 1000,
      sharesOutstanding: 100,
      debt: 200,
      cash: 50,
    };
    const result = parseMonteCarloPreset(request, payload);
    assert.equal(result.preset, "default");
    assert.ok(result.monteCarlo);
    assert.equal(result.monteCarlo.runs, 2000);
    assert.equal(result.monteCarlo.bins, 80);
    const withoutRequestId = parseMonteCarloPreset(request, { ...payload, requestId: undefined });
    assert.equal(result.monteCarlo.seed, withoutRequestId.monteCarlo?.seed);
  });

  test("produces stable seeds regardless of object key insertion order", () => {
    const request = new Request("http://localhost/api/dcf/preview?mc=fast");
    const payloadA = { symbol: "AAPL", baseYear: 2024, periods: 5 };
    const payloadB = { periods: 5, baseYear: 2024, symbol: "AAPL" };
    const seedA = parseMonteCarloPreset(request, payloadA).monteCarlo?.seed;
    const seedB = parseMonteCarloPreset(request, payloadB).monteCarlo?.seed;
    assert.equal(seedA, seedB);
  });

  test("ignores requestId differences when deriving seed", () => {
    const request = new Request("http://localhost/api/dcf/preview?mc=fast");
    const payloadA = {
      base: {
        revenueGrowth: 0.05,
        ebitMargin: 0.2,
        taxRate: 0.25,
        salesToCapital: 1.8,
        wacc: 0.09,
        gStable: 0.03,
        waccStable: 0.08,
      },
      bull: {
        revenueGrowth: 0.07,
        ebitMargin: 0.22,
        taxRate: 0.24,
        salesToCapital: 1.9,
        wacc: 0.085,
        gStable: 0.032,
        waccStable: 0.082,
      },
      bear: {
        revenueGrowth: 0.03,
        ebitMargin: 0.18,
        taxRate: 0.27,
        salesToCapital: 1.6,
        wacc: 0.1,
        gStable: 0.028,
        waccStable: 0.09,
      },
      revenueT0: 1000,
      sharesOutstanding: 100,
      requestId: "req-1",
    };
    const payloadB = { ...payloadA, requestId: "req-2" };
    const seedA = parseMonteCarloPreset(request, payloadA).monteCarlo?.seed;
    const seedB = parseMonteCarloPreset(request, payloadB).monteCarlo?.seed;
    assert.equal(seedA, seedB);
  });

  test("ignores non-valuation fields when deriving seed", () => {
    const request = new Request("http://localhost/api/dcf/preview?mc=fast");
    const basePayload = {
      periods: 10,
      revenueT0: 1000,
      cash: 50,
      debt: 200,
      otherNonOperatingAssets: 10,
      sharesOutstanding: 100,
      reinvestmentLagYears: 2,
      base: {
        revenueGrowth: 0.05,
        ebitMargin: 0.2,
        taxRate: 0.25,
        salesToCapital: 1.8,
        wacc: 0.09,
        gStable: 0.03,
        waccStable: 0.08,
      },
      bull: {
        revenueGrowth: 0.07,
        ebitMargin: 0.22,
        taxRate: 0.24,
        salesToCapital: 1.9,
        wacc: 0.085,
        gStable: 0.032,
        waccStable: 0.082,
      },
      bear: {
        revenueGrowth: 0.03,
        ebitMargin: 0.18,
        taxRate: 0.27,
        salesToCapital: 1.6,
        wacc: 0.1,
        gStable: 0.028,
        waccStable: 0.09,
      },
    };
    const seedA = parseMonteCarloPreset(request, {
      ...basePayload,
      symbol: "AAPL",
      primaryKeyNorm: "aapl",
      regionCode: "US",
      asOfDate: "2024-12-31",
      statements: [{ periodEnd: "2024-12-31", revenue: 1000 }],
    }).monteCarlo?.seed;
    const seedB = parseMonteCarloPreset(request, {
      ...basePayload,
      symbol: "MSFT",
      primaryKeyNorm: "msft",
      regionCode: "EU",
      asOfDate: "2025-01-31",
      statements: [{ periodEnd: "2024-12-31", revenue: 2000 }],
    }).monteCarlo?.seed;
    assert.equal(seedA, seedB);
  });

  test("changes seed when valuation inputs change", () => {
    const request = new Request("http://localhost/api/dcf/preview?mc=fast");
    const basePayload = {
      periods: 10,
      revenueT0: 1000,
      cash: 50,
      debt: 200,
      otherNonOperatingAssets: 10,
      sharesOutstanding: 100,
      reinvestmentLagYears: 2,
      base: {
        revenueGrowth: 0.05,
        ebitMargin: 0.2,
        taxRate: 0.25,
        salesToCapital: 1.8,
        wacc: 0.09,
        gStable: 0.03,
        waccStable: 0.08,
      },
      bull: {
        revenueGrowth: 0.07,
        ebitMargin: 0.22,
        taxRate: 0.24,
        salesToCapital: 1.9,
        wacc: 0.085,
        gStable: 0.032,
        waccStable: 0.082,
      },
      bear: {
        revenueGrowth: 0.03,
        ebitMargin: 0.18,
        taxRate: 0.27,
        salesToCapital: 1.6,
        wacc: 0.1,
        gStable: 0.028,
        waccStable: 0.09,
      },
    };
    const seedA = parseMonteCarloPreset(request, basePayload).monteCarlo?.seed;
    const seedB = parseMonteCarloPreset(request, {
      ...basePayload,
      base: { ...basePayload.base, revenueGrowth: 0.06 },
    }).monteCarlo?.seed;
    assert.notEqual(seedA, seedB);
  });

  test("sanitizePayload drops non-input fields", () => {
    const payload = {
      includeTrace: true,
      monteCarlo: { runs: 123 },
      monteCarloPreset: "default",
      symbol: "AAPL",
    };
    assert.deepEqual(sanitizePayload(payload), { symbol: "AAPL" });
  });

  test("adds oneFactor dependence when env is enabled", () => {
    const prevDependence = process.env.MONTE_CARLO_DEPENDENCE;
    const prevLoading = process.env.MONTE_CARLO_ONE_FACTOR_LOADING;
    process.env.MONTE_CARLO_DEPENDENCE = "oneFactor";
    process.env.MONTE_CARLO_ONE_FACTOR_LOADING = "0.8";

    try {
      const request = new Request("http://localhost/api/dcf/preview?mc=high");
      const result = parseMonteCarloPreset(request, { requestId: "abc" });
      assert.equal(result.preset, "high");
      assert.ok(result.monteCarlo);
      assert.deepEqual(result.monteCarlo.dependence, { model: "oneFactor", loading: 0.8 });
    } finally {
      if (prevDependence === undefined) {
        delete process.env.MONTE_CARLO_DEPENDENCE;
      } else {
        process.env.MONTE_CARLO_DEPENDENCE = prevDependence;
      }
      if (prevLoading === undefined) {
        delete process.env.MONTE_CARLO_ONE_FACTOR_LOADING;
      } else {
        process.env.MONTE_CARLO_ONE_FACTOR_LOADING = prevLoading;
      }
    }
  });
});
