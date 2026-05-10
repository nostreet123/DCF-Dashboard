import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ConvexHttpClient } from "convex/browser";

import { GET, POST } from "../app/api/company/facts/route";
import { createInternalPersistenceHeaders } from "../app/api/_lib/internalAuth";
import { resetRateLimitStateForTests } from "../app/api/_lib/rateLimit";
import { installSecurityMutationsMock } from "./helpers/securityMutationsMock";

const originalInternalPersistenceKey = process.env.INTERNAL_PERSISTENCE_KEY;
const originalConvexUrl = process.env.CONVEX_URL;
const originalSyncToken = process.env.DAMODARAN_SYNC_TOKEN;
const originalDcfEngineUrl = process.env.DCF_ENGINE_URL;
const originalAllowUnsigned = process.env.DCF_ENGINE_ALLOW_UNSIGNED;
const originalFetch = globalThis.fetch;
const originalQuery = ConvexHttpClient.prototype.query;

let restoreSecurityMock: (() => void) | null = null;

beforeEach(() => {
  process.env.CONVEX_URL = "https://example.convex.cloud";
  process.env.DAMODARAN_SYNC_TOKEN = "sync-token";
  process.env.DCF_ENGINE_URL = "http://example.test";
  process.env.DCF_ENGINE_ALLOW_UNSIGNED = "1";
  const securityMock = installSecurityMutationsMock();
  restoreSecurityMock = securityMock.restore;
  ConvexHttpClient.prototype.query = async () => null;
});

afterEach(() => {
  resetRateLimitStateForTests();
  if (restoreSecurityMock) {
    restoreSecurityMock();
  }
  restoreSecurityMock = null;
  globalThis.fetch = originalFetch;
  ConvexHttpClient.prototype.query = originalQuery;

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
  if (originalInternalPersistenceKey === undefined) {
    delete process.env.INTERNAL_PERSISTENCE_KEY;
  } else {
    process.env.INTERNAL_PERSISTENCE_KEY = originalInternalPersistenceKey;
  }
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
});

describe("company facts route auth boundaries", () => {
  test("GET returns bad request when symbol is missing", async () => {
    const response = await GET(
      new Request("http://localhost/api/company/facts", {
        headers: { "x-vercel-forwarded-for": "203.0.113.40" },
      }),
    );
    expect(response.status).toBe(400);
  });

  test("POST rejects unauthorized persistence requests", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    const response = await POST(
      new Request("http://localhost/api/company/facts?symbol=AAPL", {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.41" },
      }),
    );
    expect(response.status).toBe(401);
  });

  test("POST validates symbol even for authorized requests", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    const authHeaders = createInternalPersistenceHeaders({
      secret: "secret",
      method: "POST",
      url: "http://localhost/api/company/facts",
      body: "",
      nonce: "company-facts-auth-test",
      timestampMs: Date.now(),
    });
    const response = await POST(
      new Request("http://localhost/api/company/facts", {
        method: "POST",
        headers: {
          ...authHeaders,
          "x-vercel-forwarded-for": "203.0.113.42",
        },
      }),
    );
    expect(response.status).toBe(400);
  });

  test("GET uses official SEC facts for SEC listings even when imported facts exist", async () => {
    const queryCalls: unknown[] = [];
    ConvexHttpClient.prototype.query = async (name, args) => {
      queryCalls.push({ name, args });
      return {
        facts: {
          statements: [
            {
              periodEnd: "2020-12-31",
              periodType: "FY",
              revenue: 1,
              sharesOutstanding: 1,
            },
          ],
        },
      };
    };
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          symbol: "AAPL",
          source: "edgar",
          updated_at: 1,
          statements: [
            {
              period_end: "2025-09-27",
              period_type: "FY",
              revenue: 416_161_000_000,
              shares_outstanding: 14_773_260_000,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    const response = await GET(
      new Request("http://localhost/api/company/facts?symbol=AAPL&listingId=XNAS:AAPL", {
        headers: { "x-vercel-forwarded-for": "203.0.113.43" },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(queryCalls).toEqual([]);
    expect(payload.source).toBe("edgar");
    expect(payload.statements[0].period_end).toBe("2025-09-27");
  });
});
