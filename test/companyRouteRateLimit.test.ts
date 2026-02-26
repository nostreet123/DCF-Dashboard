/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { GET as companyFactsGet } from "../app/api/company/facts/route";
import { GET as companySearchGet } from "../app/api/company/search/route";
import { __resetRateLimitStateForTests } from "../app/api/_lib/rateLimit";

const originalFetch = globalThis.fetch;
const originalNodeEnv = process.env.NODE_ENV;
const originalDcfEngineUrl = process.env.DCF_ENGINE_URL;
const originalConvexUrl = process.env.CONVEX_URL;
const originalSyncToken = process.env.DAMODARAN_SYNC_TOKEN;
const originalRateLimitMax = process.env.DCF_COMPUTE_RATE_LIMIT_MAX;
const originalRateLimitWindowMs = process.env.DCF_COMPUTE_RATE_LIMIT_WINDOW_MS;
const originalRateLimitBackend = process.env.DCF_RATE_LIMIT_BACKEND;
const originalTrustProxyHeaders = process.env.DCF_TRUST_PROXY_HEADERS;
const originalTrustXForwardedFor = process.env.DCF_TRUST_X_FORWARDED_FOR;
const originalAllowSharedAnonymous = process.env.DCF_ALLOW_SHARED_ANONYMOUS_LIMITER;
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
  delete process.env.DCF_RATE_LIMIT_BACKEND;
  delete process.env.DCF_TRUST_PROXY_HEADERS;
  delete process.env.DCF_TRUST_X_FORWARDED_FOR;
  delete process.env.DCF_ALLOW_SHARED_ANONYMOUS_LIMITER;
  __resetRateLimitStateForTests();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
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

  if (originalRateLimitBackend === undefined) {
    delete process.env.DCF_RATE_LIMIT_BACKEND;
  } else {
    process.env.DCF_RATE_LIMIT_BACKEND = originalRateLimitBackend;
  }

  if (originalConvexUrl === undefined) {
    delete process.env.CONVEX_URL;
  } else {
    process.env.CONVEX_URL = originalConvexUrl;
  }

  if (originalSyncToken === undefined) {
    delete process.env.DAMODARAN_SYNC_TOKEN;
  } else {
    process.env.DAMODARAN_SYNC_TOKEN = originalSyncToken;
  }

  if (originalTrustProxyHeaders === undefined) {
    delete process.env.DCF_TRUST_PROXY_HEADERS;
  } else {
    process.env.DCF_TRUST_PROXY_HEADERS = originalTrustProxyHeaders;
  }

  if (originalTrustXForwardedFor === undefined) {
    delete process.env.DCF_TRUST_X_FORWARDED_FOR;
  } else {
    process.env.DCF_TRUST_X_FORWARDED_FOR = originalTrustXForwardedFor;
  }

  if (originalAllowSharedAnonymous === undefined) {
    delete process.env.DCF_ALLOW_SHARED_ANONYMOUS_LIMITER;
  } else {
    process.env.DCF_ALLOW_SHARED_ANONYMOUS_LIMITER = originalAllowSharedAnonymous;
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

  test("fails fast when convex backend is forced but not configured", async () => {
    process.env.DCF_RATE_LIMIT_BACKEND = "convex";
    delete process.env.CONVEX_URL;
    delete process.env.DAMODARAN_SYNC_TOKEN;

    const response = await companySearchGet(
      new Request("http://localhost/api/company/search?q=AAPL"),
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.code).toBe("SERVICE_UNAVAILABLE");
  });

  test("returns service unavailable in production when no trusted identity source is configured", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.DCF_TRUST_PROXY_HEADERS;
    delete process.env.DCF_TRUST_X_FORWARDED_FOR;
    delete process.env.DCF_ALLOW_SHARED_ANONYMOUS_LIMITER;

    const response = await companySearchGet(
      new Request("http://localhost/api/company/search?q=AAPL"),
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.code).toBe("SERVICE_UNAVAILABLE");
  });

  test("ignores x-forwarded-for when trust opt-in is disabled", async () => {
    globalThis.fetch = createMockFetch(async () =>
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const first = await companySearchGet(
      new Request("http://localhost/api/company/search?q=AAPL", {
        headers: {
          "x-forwarded-for": "198.51.100.10",
          "user-agent": "rate-limit-test-agent",
        },
      }),
    );
    const second = await companySearchGet(
      new Request("http://localhost/api/company/search?q=AAPL", {
        headers: {
          "x-forwarded-for": "198.51.100.11",
          "user-agent": "rate-limit-test-agent",
        },
      }),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  test("uses x-forwarded-for when trust opt-in is enabled", async () => {
    process.env.DCF_TRUST_X_FORWARDED_FOR = "true";
    globalThis.fetch = createMockFetch(async () =>
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const first = await companySearchGet(
      new Request("http://localhost/api/company/search?q=AAPL", {
        headers: { "x-forwarded-for": "198.51.100.20" },
      }),
    );
    const second = await companySearchGet(
      new Request("http://localhost/api/company/search?q=AAPL", {
        headers: { "x-forwarded-for": "198.51.100.21" },
      }),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });
});
