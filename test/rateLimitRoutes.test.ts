import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { POST as dcfPreviewPost } from "../app/api/dcf/preview/route";
import { GET as companySearchGet } from "../app/api/company/search/route";
import { resetRateLimitStateForTests } from "../app/api/_lib/rateLimit";

const originalFetch = globalThis.fetch;
const originalDcfEngineUrl = process.env.DCF_ENGINE_URL;
const originalPreviewLimit = process.env.API_RATE_LIMIT_DCF_PREVIEW_PER_MINUTE;
const originalSearchLimit = process.env.API_RATE_LIMIT_COMPANY_SEARCH_PER_MINUTE;

beforeEach(() => {
  process.env.DCF_ENGINE_URL = "http://example.test";
  process.env.API_RATE_LIMIT_DCF_PREVIEW_PER_MINUTE = "1";
  process.env.API_RATE_LIMIT_COMPANY_SEARCH_PER_MINUTE = "1";
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
});

afterEach(() => {
  resetRateLimitStateForTests();
  globalThis.fetch = originalFetch;
  if (originalDcfEngineUrl === undefined) {
    delete process.env.DCF_ENGINE_URL;
  } else {
    process.env.DCF_ENGINE_URL = originalDcfEngineUrl;
  }
  if (originalPreviewLimit === undefined) {
    delete process.env.API_RATE_LIMIT_DCF_PREVIEW_PER_MINUTE;
  } else {
    process.env.API_RATE_LIMIT_DCF_PREVIEW_PER_MINUTE = originalPreviewLimit;
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
      "cf-connecting-ip": "203.0.113.10",
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
    const headers = { "x-real-ip": "203.0.113.11" };
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

  test("cf-connecting-ip takes precedence over x-forwarded-for for bucketing", async () => {
    // Both requests carry the same cf-connecting-ip but different x-forwarded-for values.
    // They must land in the same rate-limit bucket, so the second should be rejected.
    const cfIp = "203.0.113.20";
    const first = await companySearchGet(
      new Request("http://localhost/api/company/search?q=AAPL", {
        headers: { "cf-connecting-ip": cfIp, "x-forwarded-for": "1.2.3.4" },
      }),
    );
    const second = await companySearchGet(
      new Request("http://localhost/api/company/search?q=AAPL", {
        headers: { "cf-connecting-ip": cfIp, "x-forwarded-for": "5.6.7.8" },
      }),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  test("does not trust x-forwarded-for as a client identity source", async () => {
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

    // With no trusted IP headers, both requests fall into the same untrusted bucket.
    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });
});
