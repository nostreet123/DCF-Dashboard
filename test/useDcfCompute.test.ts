/// <reference types="bun-types" />
/**
 * Tests for useDcfCompute concurrency logic.
 *
 * These tests exercise `buildComputeFns` / `createComputeRefs` directly,
 * avoiding any React module mocking so the tests are safe to run as part of
 * the full `bun test` suite.
 */
import { expect, test, describe, mock, beforeEach } from "bun:test";
import {
  buildComputeFns,
  createComputeRefs,
  normalizeDcfComputeResponse,
  type ComputeRefs,
  type ComputeCallbacks,
} from "../lib/hooks/useDcfCompute";

const INPUTS = {
  symbol: "AAPL",
  scenario: "base" as const,
  assumptions: {
    base: {
      revenueGrowth: 10,
      operatingMargin: 20,
      discountRate: 10,
      terminalGrowth: 2,
    },
    bull: {
      revenueGrowth: 14,
      operatingMargin: 24,
      discountRate: 9,
      terminalGrowth: 2.5,
    },
    bear: {
      revenueGrowth: 6,
      operatingMargin: 16,
      discountRate: 12,
      terminalGrowth: 1.5,
    },
  },
};

const FACTS_PAYLOAD = {
  symbol: "AAPL",
  currency: "USD",
  statements: [
    {
      period_end: "2024-12-31",
      period_type: "FY",
      revenue: 100,
      cash: 10,
      debt: 20,
      shares_outstanding: 10,
    },
  ],
};

const COMPUTE_PAYLOAD = {
  base: {
    valuation: { fairValuePerShare: 42 },
    trace: {
      forecast: {
        years: [2025, 2026],
        revenue: [110, 121],
        ebit: [22, 24.2],
        nopat: [16.5, 18.15],
        fcff: [12, 13.2],
      },
    },
  },
  bull: { valuation: { fairValuePerShare: 55 } },
  bear: { valuation: { fairValuePerShare: 31 } },
  sensitivity: {
    growthOffsets: [-0.01, 0, 0.01],
    waccOffsets: [-0.01, 0, 0.01],
    values: [],
  },
  kpis: {
    kpis: [
      { key: "margin", label: "EBIT Margin", value: 22, score: 75, direction: "higher", unit: "%" },
    ],
    history: [
      { periodEnd: "2024-12-31", revenue: 100, cash: 10, debt: 20, sharesOutstanding: 10 },
    ],
  },
  monteCarlo: {
    runs: 2000,
    summary: {
      min: 20,
      max: 70,
      mean: 44,
      median: 43,
      p10: 30,
      p25: 36,
      p75: 50,
      p90: 55,
    },
    histogram: { binCenters: [], density: [] },
  },
};

const jsonResponse = (payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

function setup(debounceMs = 10) {
  const refs = createComputeRefs();
  let isLoading = false;
  let error: Error | null = null;
  let result: any = null;

  const cbs: ComputeCallbacks = {
    setIsLoading: (v: boolean) => {
      isLoading = v;
    },
    setError: (v: Error | null) => {
      error = v;
    },
    setResult: (v: any) => {
      result = v;
    },
  };

  const { compute, reset } = buildComputeFns(refs, cbs, debounceMs);

  return {
    refs,
    compute,
    reset,
    getIsLoading: () => isLoading,
    getError: () => error,
    getResult: () => result,
  };
}

describe("useDcfCompute concurrency", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("superseded debounce rejects with AbortError", async () => {
    const { compute } = setup();

    const p1 = compute(INPUTS);
    const p2 = compute({ ...INPUTS, symbol: "MSFT" });

    // p1 should be rejected because p2 superseded it during debounce
    let p1Error: Error | undefined;
    try {
      await p1;
    } catch (e: any) {
      p1Error = e;
    }

    expect(p1Error).toBeDefined();
    expect(p1Error?.name).toBe("AbortError");
    expect(p1Error?.message).toBe("Superseded");

    // Clean up p2 — it will fail because fetch isn't mocked, but we don't care
    p2.catch(() => {});
  });

  test("aborted in-flight request rejects and does NOT clear isLoading", async () => {
    let resolveFetch!: () => void;
    globalThis.fetch = mock((url: RequestInfo | URL, init?: RequestInit) => {
      return new Promise((resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        if (signal?.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
        if (String(url).startsWith("/api/dcf/preview")) {
          resolve(jsonResponse(COMPUTE_PAYLOAD));
          return;
        }
        resolveFetch = () => resolve(jsonResponse(FACTS_PAYLOAD));
      });
    }) as any;

    const { compute, getIsLoading } = setup();

    // First request: let debounce fire
    const p1 = compute(INPUTS);
    await new Promise((r) => setTimeout(r, 20));
    expect(getIsLoading()).toBe(true);

    // Second request: supersedes the in-flight first
    const p2 = compute({ ...INPUTS, symbol: "MSFT" });

    // p1 should reject with AbortError
    let p1Error: Error | undefined;
    try {
      await p1;
    } catch (e: any) {
      p1Error = e;
    }
    expect(p1Error?.name).toBe("AbortError");

    // isLoading should still be true because p2 is now active
    // After p1's finally ran, the guard prevents clearing isLoading
    // Wait for p2's debounce
    await new Promise((r) => setTimeout(r, 20));
    expect(getIsLoading()).toBe(true);

    // Resolve p2
    resolveFetch();
    await p2;
    expect(getIsLoading()).toBe(false);
  });

  test("successful request resolves and clears isLoading", async () => {
    globalThis.fetch = mock(async (url: RequestInfo | URL) => {
      if (String(url).startsWith("/api/company/facts")) {
        return jsonResponse(FACTS_PAYLOAD);
      }
      return jsonResponse(COMPUTE_PAYLOAD);
    }) as any;

    const { compute, getIsLoading } = setup();
    const p = compute(INPUTS);
    await new Promise((r) => setTimeout(r, 20));
    const result = await p;

    expect(result.fairValue).toBe(42);
    expect(result.range).toEqual([30, 55]);
    expect(getIsLoading()).toBe(false);
  });

  test("normalizes rich workbench output for dashboard detail panels", () => {
    const result = normalizeDcfComputeResponse(COMPUTE_PAYLOAD, "base", FACTS_PAYLOAD);

    expect(result.scenarios).toEqual({ base: 42, bull: 55, bear: 31 });
    expect(result.sensitivity?.growthOffsets).toEqual([-1, 0, 1]);
    expect(result.projections).toEqual([
      { year: 2025, revenue: 110, ebit: 22, nopat: 16.5, freeCashFlow: 12 },
      { year: 2026, revenue: 121, ebit: 24.2, nopat: 18.15, freeCashFlow: 13.2 },
    ]);
    expect(result.kpis[0]).toMatchObject({ key: "margin", label: "EBIT Margin" });
    expect(result.statementHistory[0]).toMatchObject({ periodEnd: "2024-12-31" });
    expect(result.monteCarloSummary?.median).toBe(43);
    expect(result.provenance).toMatchObject({
      symbol: "AAPL",
      currency: "USD",
      latestPeriodEnd: "2024-12-31",
    });
  });

  test("keeps sensitivity offset arrays in one unit system", () => {
    const result = normalizeDcfComputeResponse(
      {
        ...COMPUTE_PAYLOAD,
        sensitivity: {
          growthOffsets: [-2, -1, 0, 1, 2],
          waccOffsets: [-0.02, -0.01, 0, 0.01, 0.02],
          values: [],
        },
      },
      "base",
      FACTS_PAYLOAD,
    );

    expect(result.sensitivity?.growthOffsets).toEqual([-2, -1, 0, 1, 2]);
    expect(result.sensitivity?.waccOffsets).toEqual([-2, -1, 0, 1, 2]);
  });
});
