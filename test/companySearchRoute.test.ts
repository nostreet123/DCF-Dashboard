import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { GET } from "../app/api/company/search/route";
import { resetRateLimitStateForTests } from "../app/api/_lib/rateLimit";
import { installSecurityMutationsMock } from "./helpers/securityMutationsMock";

const asFetchMock = (fn: (...args: unknown[]) => Promise<Response>): typeof fetch =>
  fn as unknown as typeof fetch;

const originalDcfEngineUrl = process.env.DCF_ENGINE_URL;
const originalAllowUnsigned = process.env.DCF_ENGINE_ALLOW_UNSIGNED;
const originalConvexUrl = process.env.CONVEX_URL;
const originalAllowLocalRateLimit = process.env.DCF_RATE_LIMIT_ALLOW_LOCALHOST;
const originalFetch = globalThis.fetch;

let restoreSecurityMock: (() => void) | null = null;

beforeEach(() => {
  process.env.DCF_ENGINE_URL = "http://example.test";
  process.env.DCF_ENGINE_ALLOW_UNSIGNED = "1";
  process.env.DCF_RATE_LIMIT_ALLOW_LOCALHOST = "1";
  delete process.env.CONVEX_URL;
  const securityMock = installSecurityMutationsMock();
  restoreSecurityMock = securityMock.restore;
});

afterEach(() => {
  resetRateLimitStateForTests();
  globalThis.fetch = originalFetch;
  if (restoreSecurityMock) {
    restoreSecurityMock();
  }
  restoreSecurityMock = null;
  if (originalDcfEngineUrl === undefined) {
    delete process.env.DCF_ENGINE_URL;
  } else {
    process.env.DCF_ENGINE_URL = originalDcfEngineUrl;
  }
  if (originalAllowUnsigned === undefined) {
    delete process.env.DCF_ENGINE_ALLOW_UNSIGNED;
  } else {
    process.env.DCF_ENGINE_ALLOW_UNSIGNED = originalAllowUnsigned;
  }
  if (originalConvexUrl === undefined) {
    delete process.env.CONVEX_URL;
  } else {
    process.env.CONVEX_URL = originalConvexUrl;
  }
  if (originalAllowLocalRateLimit === undefined) {
    delete process.env.DCF_RATE_LIMIT_ALLOW_LOCALHOST;
  } else {
    process.env.DCF_RATE_LIMIT_ALLOW_LOCALHOST = originalAllowLocalRateLimit;
  }
});

describe("company search route", () => {
  test("does not downgrade official search timeouts to legacy SEC results", async () => {
    globalThis.fetch = asFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/company/search")) {
        init?.signal?.dispatchEvent(new Event("abort"));
        throw new DOMException("The operation was aborted.", "AbortError");
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const response = await GET(
      new Request("http://localhost/api/company/search?q=AAPL", {
        headers: { "x-vercel-forwarded-for": "203.0.113.121" },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json.code).toBe("SEARCH_UNAVAILABLE");
  });

  test("preserves SEC exchange metadata in fallback results", async () => {
    globalThis.fetch = asFetchMock(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/company/search")) {
        return new Response(JSON.stringify({ detail: "official search unavailable" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/sec/search")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                symbol: "SAP",
                name: "SAP SE",
                cik: "0001000184",
                listing_id: "XFRA:SAP",
                mic: "XFRA",
                exchange: "Frankfurt Stock Exchange",
                country_code: "DE",
                coverage_state: "import_required",
                detail_url: "https://www.sec.gov/edgar/browse/?CIK=1000184",
              },
            ],
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const response = await GET(
      new Request("http://localhost/api/company/search?q=SAP", {
        headers: { "x-vercel-forwarded-for": "203.0.113.120" },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.source).toBe("edgar");
    expect(json.results[0]).toMatchObject({
      id: "XFRA:SAP",
      symbol: "SAP",
      exchangeMic: "XFRA",
      market: "Frankfurt Stock Exchange",
      country: "DE",
      coverageState: "import_required",
    });
    expect(json.results[0].sourceLinks[0]).toEqual({
      title: "SEC EDGAR Browse",
      url: "https://www.sec.gov/edgar/browse/?CIK=1000184",
    });
  });

  test("does not downgrade upstream timeout statuses to legacy SEC results", async () => {
    globalThis.fetch = asFetchMock(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/company/search")) {
        return new Response(JSON.stringify({ detail: "gateway timeout" }), {
          status: 504,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const response = await GET(
      new Request("http://localhost/api/company/search?q=AAPL", {
        headers: { "x-vercel-forwarded-for": "203.0.113.122" },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json.code).toBe("SEARCH_UNAVAILABLE");
  });
});
