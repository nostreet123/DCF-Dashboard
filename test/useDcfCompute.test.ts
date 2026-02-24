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
  type ComputeRefs,
  type ComputeCallbacks,
} from "../lib/hooks/useDcfCompute";

const INPUTS = {
  symbol: "AAPL",
  revenueGrowth: 10,
  operatingMargin: 20,
  discountRate: 10,
  terminalGrowth: 2,
};

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
        resolveFetch = () =>
          resolve(
            new Response(JSON.stringify({ fairValue: 100 }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
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
    globalThis.fetch = mock(async () => {
      return new Response(
        JSON.stringify({
          fairValue: 42,
          range: [30, 55],
          histogram: { binCenters: [], density: [] },
          sensitivityMatrix: [],
          projections: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as any;

    const { compute, getIsLoading } = setup();
    const p = compute(INPUTS);
    await new Promise((r) => setTimeout(r, 20));
    const result = await p;

    expect(result.fairValue).toBe(42);
    expect(getIsLoading()).toBe(false);
  });
});
