import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseMonteCarloPreset, sanitizePayload } from "../app/api/_lib/monteCarloPreset.ts";

describe("monteCarloPreset", () => {
  it("returns off when mc param is missing", () => {
    const request = new Request("http://localhost/api/dcf/preview");
    const payload = { requestId: "abc" };
    const result = parseMonteCarloPreset(request, payload);
    assert.equal(result.preset, "off");
    assert.equal(result.monteCarlo, undefined);
  });

  it("supports mc=off explicitly", () => {
    const request = new Request("http://localhost/api/dcf/preview?mc=off");
    const payload = { requestId: "abc" };
    const result = parseMonteCarloPreset(request, payload);
    assert.equal(result.preset, "off");
    assert.equal(result.monteCarlo, undefined);
  });

  it("rejects invalid mc values", () => {
    const request = new Request("http://localhost/api/dcf/preview?mc=banana");
    const payload = { requestId: "abc" };
    assert.throws(() => parseMonteCarloPreset(request, payload), /Invalid mc parameter/);
  });

  it("maps presets to runs/bins and derives seed from inputs", () => {
    const request = new Request("http://localhost/api/dcf/preview?mc=default");
    const payload = { requestId: "req-123", symbol: "AAPL" };
    const result = parseMonteCarloPreset(request, payload);
    assert.equal(result.preset, "default");
    assert.ok(result.monteCarlo);
    assert.equal(result.monteCarlo.runs, 2000);
    assert.equal(result.monteCarlo.bins, 80);
    const withoutRequestId = parseMonteCarloPreset(request, { symbol: "AAPL" });
    assert.equal(result.monteCarlo.seed, withoutRequestId.monteCarlo?.seed);
  });

  it("produces stable seeds regardless of object key insertion order", () => {
    const request = new Request("http://localhost/api/dcf/preview?mc=fast");
    const payloadA = { symbol: "AAPL", baseYear: 2024, periods: 5 };
    const payloadB = { periods: 5, baseYear: 2024, symbol: "AAPL" };
    const seedA = parseMonteCarloPreset(request, payloadA).monteCarlo?.seed;
    const seedB = parseMonteCarloPreset(request, payloadB).monteCarlo?.seed;
    assert.equal(seedA, seedB);
  });

  it("ignores requestId differences when deriving seed", () => {
    const request = new Request("http://localhost/api/dcf/preview?mc=fast");
    const payloadA = { symbol: "AAPL", baseYear: 2024, requestId: "req-1" };
    const payloadB = { symbol: "AAPL", baseYear: 2024, requestId: "req-2" };
    const seedA = parseMonteCarloPreset(request, payloadA).monteCarlo?.seed;
    const seedB = parseMonteCarloPreset(request, payloadB).monteCarlo?.seed;
    assert.equal(seedA, seedB);
  });

  it("sanitizePayload drops non-input fields", () => {
    const payload = {
      includeTrace: true,
      monteCarlo: { runs: 123 },
      monteCarloPreset: "default",
      symbol: "AAPL",
    };
    assert.deepEqual(sanitizePayload(payload), { symbol: "AAPL" });
  });

  it("adds oneFactor dependence when env is enabled", () => {
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
