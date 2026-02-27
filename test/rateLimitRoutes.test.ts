import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ConvexHttpClient } from "convex/browser";

import { GET as companyFactsGet } from "../app/api/company/facts/route";
import { POST as dcfPreviewPost } from "../app/api/dcf/preview/route";
import { POST as dcfRunPost } from "../app/api/dcf/run/route";
import { GET as companySearchGet } from "../app/api/company/search/route";
import { resetRateLimitStateForTests } from "../app/api/_lib/rateLimit";
import { installSecurityMutationsMock } from "./helpers/securityMutationsMock";

const originalFetch = globalThis.fetch;
const originalDcfEngineUrl = process.env.DCF_ENGINE_URL;
const originalFactsLimit = process.env.API_RATE_LIMIT_COMPANY_FACTS_PER_MINUTE;
const originalPreviewLimit = process.env.API_RATE_LIMIT_DCF_PREVIEW_PER_MINUTE;
const originalRunLimit = process.env.API_RATE_LIMIT_DCF_RUN_PER_MINUTE;
const originalSearchLimit = process.env.API_RATE_LIMIT_COMPANY_SEARCH_PER_MINUTE;
const originalConvexUrl = process.env.CONVEX_URL;
const originalSyncToken = process.env.DAMODARAN_SYNC_TOKEN;
const originalIdentityMode = process.env.RATE_LIMIT_IDENTITY_MODE;
const originalIdentitySource = process.env.RATE_LIMIT_IDENTITY_SOURCE;
const originalQuery = ConvexHttpClient.prototype.query;
const noopPreconnect: typeof fetch.preconnect = () => {};

function createMockFetch(
  impl: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>,
): typeof fetch {
  return Object.assign(impl, { preconnect: noopPreconnect });
}

let restoreSecurityMock: (() => void) | null = null;

beforeEach(() => {
  process.env.DCF_ENGINE_URL = "http://example.test";
  process.env.API_RATE_LIMIT_COMPANY_FACTS_PER_MINUTE = "1";
  process.env.API_RATE_LIMIT_DCF_PREVIEW_PER_MINUTE = "1";
  process.env.API_RATE_LIMIT_DCF_RUN_PER_MINUTE = "1";
  process.env.API_RATE_LIMIT_COMPANY_SEARCH_PER_MINUTE = "1";
  process.env.CONVEX_URL = "https://example.convex.cloud";
  process.env.DAMODARAN_SYNC_TOKEN = "sync-token";
  delete process.env.RATE_LIMIT_IDENTITY_MODE;
  delete process.env.RATE_LIMIT_IDENTITY_SOURCE;
  const securityMock = installSecurityMutationsMock();
  restoreSecurityMock = securityMock.restore;
  ConvexHttpClient.prototype.query = async () => [];
  globalThis.fetch = createMockFetch(async () =>
    new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
});

afterEach(() => {
  resetRateLimitStateForTests();
  globalThis.fetch = originalFetch;
  ConvexHttpClient.prototype.query = originalQuery;
  if (restoreSecurityMock) {
    restoreSecurityMock();
  }
  restoreSecurityMock = null;

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
  if (originalIdentityMode === undefined) {
    delete process.env.RATE_LIMIT_IDENTITY_MODE;
  } else {
    process.env.RATE_LIMIT_IDENTITY_MODE = originalIdentityMode;
  }
  if (originalIdentitySource === undefined) {
    delete process.env.RATE_LIMIT_IDENTITY_SOURCE;
  } else {
    process.env.RATE_LIMIT_IDENTITY_SOURCE = originalIdentitySource;
  }
  if (originalDcfEngineUrl === undefined) {
    delete process.env.DCF_ENGINE_URL;
  } else {
    process.env.DCF_ENGINE_URL = originalDcfEngineUrl;
  }
  if (originalFactsLimit === undefined) {
    delete process.env.API_RATE_LIMIT_COMPANY_FACTS_PER_MINUTE;
  } else {
    process.env.API_RATE_LIMIT_COMPANY_FACTS_PER_MINUTE = originalFactsLimit;
  }
  if (originalPreviewLimit === undefined) {
    delete process.env.API_RATE_LIMIT_DCF_PREVIEW_PER_MINUTE;
  } else {
    process.env.API_RATE_LIMIT_DCF_PREVIEW_PER_MINUTE = originalPreviewLimit;
  }
  if (originalRunLimit === undefined) {
    delete process.env.API_RATE_LIMIT_DCF_RUN_PER_MINUTE;
  } else {
    process.env.API_RATE_LIMIT_DCF_RUN_PER_MINUTE = originalRunLimit;
  }
  if (originalSearchLimit === undefined) {
    delete process.env.API_RATE_LIMIT_COMPANY_SEARCH_PER_MINUTE;
  } else {
    process.env.API_RATE_LIMIT_COMPANY_SEARCH_PER_MINUTE = originalSearchLimit;
  }
});

describe("route rate limiting", () => {
  test("limits dcf preview requests per trusted client ip", async () => {
    const headers = {
      "Content-Type": "application/json",
      "x-vercel-forwarded-for": "203.0.113.10",
    };
    const first = await dcfPreviewPost(
      new Request("http://localhost/api/dcf/preview", {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      }),
    );
    const second = await dcfPreviewPost(
      new Request("http://localhost/api/dcf/preview", {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      }),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  test("limits company search requests per trusted client ip", async () => {
    const headers = { "x-vercel-forwarded-for": "203.0.113.11" };
    const first = await companySearchGet(
      new Request("http://localhost/api/company/search?q=AAPL", {
        headers,
      }),
    );
    const second = await companySearchGet(
      new Request("http://localhost/api/company/search?q=AAPL", {
        headers,
      }),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  test("limits company facts requests per trusted client ip", async () => {
    globalThis.fetch = createMockFetch(async () =>
      new Response(
        JSON.stringify({
          symbol: "AAPL",
          cik: "0000320193",
          updated_at: Date.now(),
          statements: [],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    const headers = { "x-vercel-forwarded-for": "203.0.113.12" };
    const first = await companyFactsGet(
      new Request("http://localhost/api/company/facts?symbol=AAPL", {
        headers,
      }),
    );
    const second = await companyFactsGet(
      new Request("http://localhost/api/company/facts?symbol=AAPL", {
        headers,
      }),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  test("returns RATE_LIMIT_UNAVAILABLE when rate-limit backend is unavailable", async () => {
    delete process.env.CONVEX_URL;
    delete process.env.DAMODARAN_SYNC_TOKEN;

    const response = await companySearchGet(
      new Request("http://localhost/api/company/search?q=AAPL", {
        headers: { "x-vercel-forwarded-for": "203.0.113.13" },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.code).toBe("RATE_LIMIT_UNAVAILABLE");
  });

  test("uses x-vercel-forwarded-for even when spoofed x-real-ip is present", async () => {
    const vercelIp = "203.0.113.14";
    const first = await companySearchGet(
      new Request("http://localhost/api/company/search?q=AAPL", {
        headers: {
          "x-vercel-forwarded-for": vercelIp,
          "x-real-ip": "198.51.100.10",
        },
      }),
    );
    const second = await companySearchGet(
      new Request("http://localhost/api/company/search?q=AAPL", {
        headers: {
          "x-vercel-forwarded-for": vercelIp,
          "x-real-ip": "198.51.100.11",
        },
      }),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  test("normalizes IPv4-mapped IPv6 values for bucketing", async () => {
    const mappedIp = "::ffff:203.0.113.20";
    const first = await companySearchGet(
      new Request("http://localhost/api/company/search?q=AAPL", {
        headers: { "x-vercel-forwarded-for": mappedIp },
      }),
    );
    const second = await companySearchGet(
      new Request("http://localhost/api/company/search?q=AAPL", {
        headers: { "x-vercel-forwarded-for": "203.0.113.20" },
      }),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  test("rejects requests that only provide x-forwarded-for in secure default mode", async () => {
    const first = await companySearchGet(
      new Request("http://localhost/api/company/search?q=AAPL", {
        headers: { "x-forwarded-for": "203.0.113.30" },
      }),
    );
    const second = await companySearchGet(
      new Request("http://localhost/api/company/search?q=AAPL", {
        headers: { "x-forwarded-for": "203.0.113.31" },
      }),
    );
    const firstJson = await first.json();
    const secondJson = await second.json();

    expect(first.status).toBe(429);
    expect(firstJson.code).toBe("UNTRUSTED_IDENTITY");
    expect(second.status).toBe(429);
    expect(secondJson.code).toBe("UNTRUSTED_IDENTITY");
  });

  test("rejects malformed x-vercel-forwarded-for value", async () => {
    const response = await companySearchGet(
      new Request("http://localhost/api/company/search?q=AAPL", {
        headers: { "x-vercel-forwarded-for": "not-an-ip" },
      }),
    );
    const payload = await response.json();
    expect(response.status).toBe(429);
    expect(payload.code).toBe("UNTRUSTED_IDENTITY");
  });

  test("accepts x-forwarded-for in compat source mode", async () => {
    process.env.RATE_LIMIT_IDENTITY_SOURCE = "compat";
    process.env.RATE_LIMIT_IDENTITY_MODE = "compat";
    const headers = { "x-forwarded-for": "203.0.113.70" };
    const first = await companySearchGet(
      new Request("http://localhost/api/company/search?q=AAPL", {
        headers,
      }),
    );
    const second = await companySearchGet(
      new Request("http://localhost/api/company/search?q=AAPL", {
        headers,
      }),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  test("rate limits dcf run route using x-vercel-forwarded-for", async () => {
    const headers = {
      "Content-Type": "application/json",
      "x-vercel-forwarded-for": "203.0.113.71",
    };
    const first = await dcfRunPost(
      new Request("http://localhost/api/dcf/run", {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      }),
    );
    const second = await dcfRunPost(
      new Request("http://localhost/api/dcf/run", {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      }),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });
});
