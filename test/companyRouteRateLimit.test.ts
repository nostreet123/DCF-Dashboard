/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { GET as companyFactsGet } from "../app/api/company/facts/route";
import { GET as companySearchGet } from "../app/api/company/search/route";
import { __resetRateLimitStateForTests } from "../app/api/_lib/rateLimit";

const originalFetch = globalThis.fetch;
const originalDcfEngineUrl = process.env.DCF_ENGINE_URL;
const originalRateLimitMax = process.env.DCF_COMPUTE_RATE_LIMIT_MAX;
const originalRateLimitWindowMs = process.env.DCF_COMPUTE_RATE_LIMIT_WINDOW_MS;
const noopPreconnect: typeof fetch.preconnect = () => {};

function createMockFetch(
  impl: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>,
): typeof fetch {
  return Object.assign(impl, { preconnect: noopPreconnect });
}

beforeEach(() => {
  process.env.NODE_ENV = "test";
  process.env.DCF_ENGINE_URL = "http://example.test";
  process.env.DCF_COMPUTE_RATE_LIMIT_MAX = "1";
  process.env.DCF_COMPUTE_RATE_LIMIT_WINDOW_MS = "60000";
  __resetRateLimitStateForTests();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalDcfEngineUrl === undefined) {
    delete process.env.DCF_ENGINE_URL;
  } else {
    process.env.DCF_ENGINE_URL = originalDcfEngineUrl;
  }
  if (originalRateLimitMax === undefined) {
    delete process.env.DCF_COMPUTE_RATE_LIMIT_MAX;
  } else {
    process.env.DCF_COMPUTE_RATE_LIMIT_MAX = originalRateLimitMax;
  }
  if (originalRateLimitWindowMs === undefined) {
    delete process.env.DCF_COMPUTE_RATE_LIMIT_WINDOW_MS;
  } else {
    process.env.DCF_COMPUTE_RATE_LIMIT_WINDOW_MS = originalRateLimitWindowMs;
  }
});

describe("company route rate limits", () => {
  test("limits repeated search requests from same client", async () => {
    globalThis.fetch = createMockFetch(async () =>
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const makeRequest = () =>
      companySearchGet(
        new Request("http://localhost/api/company/search?q=AAPL", {
          headers: { "x-forwarded-for": "198.51.100.1" },
        }),
      );

    const first = await makeRequest();
    const second = await makeRequest();

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  test("limits repeated facts requests from same client", async () => {
    globalThis.fetch = createMockFetch(async () =>
      new Response(
        JSON.stringify({
          symbol: "AAPL",
          cik: "0000320193",
          updated_at: 1,
          statements: [],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const makeRequest = () =>
      companyFactsGet(
        new Request("http://localhost/api/company/facts?symbol=AAPL", {
          headers: { "x-forwarded-for": "198.51.100.2" },
        }),
      );

    const first = await makeRequest();
    const second = await makeRequest();

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });
});
