import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ConvexHttpClient } from "convex/browser";

import { GET as companyFactsGet } from "../app/api/company/facts/route";
import { GET as companySearchGet } from "../app/api/company/search/route";
import { POST as dcfPreviewPost } from "../app/api/dcf/preview/route";
import { resetRateLimitStateForTests } from "../app/api/_lib/rateLimit";
import { installSecurityMutationsMock } from "./helpers/securityMutationsMock";
import { createMockFetch } from "./helpers/fetchMock";

const originalFetch = globalThis.fetch;
const originalDcfEngineUrl = process.env.DCF_ENGINE_URL;
const originalConvexUrl = process.env.CONVEX_URL;
const originalSyncToken = process.env.DAMODARAN_SYNC_TOKEN;
const originalAllowUnsigned = process.env.DCF_ENGINE_ALLOW_UNSIGNED;
const originalQuery = ConvexHttpClient.prototype.query;

let restoreSecurityMock: (() => void) | null = null;

beforeEach(() => {
  process.env.DCF_ENGINE_URL = "http://example.test";
  process.env.DCF_ENGINE_ALLOW_UNSIGNED = "1";
  process.env.CONVEX_URL = "https://example.convex.cloud";
  process.env.DAMODARAN_SYNC_TOKEN = "sync-token";
  const securityMock = installSecurityMutationsMock();
  restoreSecurityMock = securityMock.restore;
  ConvexHttpClient.prototype.query = async () => [];
});

afterEach(() => {
  resetRateLimitStateForTests();
  globalThis.fetch = originalFetch;
  ConvexHttpClient.prototype.query = originalQuery;
  if (restoreSecurityMock) {
    restoreSecurityMock();
  }
  restoreSecurityMock = null;

  if (originalDcfEngineUrl === undefined) {
    delete process.env.DCF_ENGINE_URL;
  } else {
    process.env.DCF_ENGINE_URL = originalDcfEngineUrl;
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
  if (originalAllowUnsigned === undefined) {
    delete process.env.DCF_ENGINE_ALLOW_UNSIGNED;
  } else {
    process.env.DCF_ENGINE_ALLOW_UNSIGNED = originalAllowUnsigned;
  }
});

const mockUpstreamError = (status = 500) => {
  globalThis.fetch = createMockFetch(async () =>
    new Response(JSON.stringify({ message: "sensitive upstream detail" }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
};

describe("API error sanitization", () => {
  test("dcf preview route propagates upstream HTTP status", async () => {
    mockUpstreamError(422);

    const response = await dcfPreviewPost(
      new Request("http://localhost/api/dcf/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vercel-forwarded-for": "203.0.113.50",
        },
        body: JSON.stringify({}),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.code).toBe("DCF_ENGINE_ERROR");
    expect(String(json.message)).not.toContain("sensitive upstream detail");
  });

  test("dcf preview route defaults to 502 for unknown errors", async () => {
    globalThis.fetch = createMockFetch(async () => {
      throw new Error("Network error");
    });

    const response = await dcfPreviewPost(
      new Request("http://localhost/api/dcf/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vercel-forwarded-for": "203.0.113.51",
        },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(502);
  });

  test("company search route propagates upstream HTTP status", async () => {
    mockUpstreamError(429);

    const response = await companySearchGet(
      new Request("http://localhost/api/company/search?q=AAPL", {
        headers: { "x-vercel-forwarded-for": "203.0.113.52" },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.code).toBe("EDGAR_ERROR");
    expect(String(json.message)).not.toContain("sensitive upstream detail");
  });

  test("company facts route propagates upstream HTTP status", async () => {
    mockUpstreamError(404);

    const response = await companyFactsGet(
      new Request("http://localhost/api/company/facts?symbol=AAPL", {
        headers: { "x-vercel-forwarded-for": "203.0.113.53" },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.code).toBe("EDGAR_ERROR");
    expect(String(json.message)).not.toContain("sensitive upstream detail");
  });
});
