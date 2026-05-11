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

  test("GET falls back to official SEC facts for SEC listings without approved imports", async () => {
    const queryCalls: unknown[] = [];
    ConvexHttpClient.prototype.query = async (name, args) => {
      queryCalls.push({ name, args });
      return null;
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
      new Request(
        "http://localhost/api/company/facts?symbol=AAPL&listingId=XNAS:AAPL",
        {
          headers: { "x-vercel-forwarded-for": "203.0.113.43" },
        },
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(queryCalls).toEqual([]);
    expect(payload.source).toBe("edgar");
    expect(payload.statements[0].period_end).toBe("2025-09-27");
  });

  test("GET uses official SEC facts for non-Nasdaq SEC listings", async () => {
    const queryCalls: unknown[] = [];
    ConvexHttpClient.prototype.query = async (name, args) => {
      queryCalls.push({ name, args });
      return null;
    };
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          symbol: "IBM",
          source: "edgar",
          updated_at: 1,
          statements: [
            {
              period_end: "2025-12-31",
              period_type: "FY",
              revenue: 1,
              shares_outstanding: 1,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    const response = await GET(
      new Request(
        "http://localhost/api/company/facts?symbol=IBM&listingId=XNYS:IBM",
        {
          headers: { "x-vercel-forwarded-for": "203.0.113.44" },
        },
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(queryCalls).toEqual([]);
    expect(payload.source).toBe("edgar");
  });

  test("GET returns imported facts for authorized non-SEC listings with snake_case fields", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    const url =
      "http://localhost/api/company/facts?symbol=VOD&listingId=XLON:VOD";
    const authHeaders = createInternalPersistenceHeaders({
      secret: "secret",
      method: "GET",
      url,
      nonce: "company-facts-import-read-test",
      timestampMs: Date.now(),
    });
    const queryCalls: unknown[] = [];
    ConvexHttpClient.prototype.query = async (name, args) => {
      queryCalls.push({ name, args });
      return {
        symbol: "VOD",
        name: "Vodafone Group Public Limited Company",
        currency: "GBP",
        updatedAt: 2_000,
        filingCurrency: "GBP",
        facts: {
          currency: undefined,
          statements: [
            {
              period_end: "2025-03-31",
              period_type: "FY",
              filing_date: "2025-07-01",
              revenue: 37_448_000_000,
              operating_income: 5_000_000_000,
              operating_margin: 0.1335,
              cash: 6_000_000_000,
              debt: 60_000_000_000,
              shares_outstanding: 24_100_000_000,
            },
          ],
        },
      };
    };
    globalThis.fetch = async () => {
      throw new Error("EDGAR should not be called for imported facts");
    };

    const response = await GET(
      new Request(url, {
        headers: {
          ...authHeaders,
          "x-vercel-forwarded-for": "203.0.113.45",
        },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(queryCalls).toEqual([
      { name: "imports:getImportedFacts", args: { syncToken: "sync-token", listingId: "XLON:VOD" } },
    ]);
    expect(payload.source).toBe("import");
    expect(payload.currency).toBe("GBP");
    expect(payload.filingCurrency).toBe("GBP");
    expect(payload.statements[0]).toMatchObject({
      period_type: "FY",
      filing_date: "2025-07-01",
      currency: "GBP",
      shares_outstanding: 24_100_000_000,
    });
  });

  test("GET fails closed for unauthenticated non-SEC imported facts reads", async () => {
    const queryCalls: unknown[] = [];
    ConvexHttpClient.prototype.query = async (name, args) => {
      queryCalls.push({ name, args });
      return {
        symbol: "SHOP",
        facts: {
          statements: [{ period_end: "2025-12-31", revenue: 1 }],
        },
      };
    };
    globalThis.fetch = async () => {
      throw new Error(
        "EDGAR should not be called for a non-SEC selected listing",
      );
    };

    const response = await GET(
      new Request(
        "http://localhost/api/company/facts?symbol=SHOP&listingId=XTSE:SHOP",
        {
          headers: { "x-vercel-forwarded-for": "203.0.113.46" },
        },
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.code).toBe("IMPORT_REQUIRED");
    expect(queryCalls).toEqual([]);
  });

  test("GET rejects authorized imported facts when the stored symbol mismatches the request", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    const url =
      "http://localhost/api/company/facts?symbol=AAPL&listingId=XLON:PRIVATE";
    const authHeaders = createInternalPersistenceHeaders({
      secret: "secret",
      method: "GET",
      url,
      nonce: "company-facts-symbol-mismatch-test",
      timestampMs: Date.now(),
    });
    const queryCalls: unknown[] = [];
    ConvexHttpClient.prototype.query = async (name, args) => {
      queryCalls.push({ name, args });
      return {
        symbol: "PRIVATECO",
        facts: {
          statements: [
            {
              period_end: "2025-12-31",
              revenue: 123_456_789,
              operating_income: 11_111_111,
              cash: 22_222_222,
              debt: 3_333_333,
              shares_outstanding: 44_444,
            },
          ],
        },
      };
    };
    globalThis.fetch = async () => {
      throw new Error(
        "EDGAR should not be called for a non-SEC selected listing",
      );
    };

    const response = await GET(
      new Request(url, {
        headers: {
          ...authHeaders,
          "x-vercel-forwarded-for": "203.0.113.47",
        },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.code).toBe("IMPORT_REQUIRED");
    expect(queryCalls).toEqual([
      {
        name: "imports:getImportedFacts",
        args: { syncToken: "sync-token", listingId: "XLON:PRIVATE" },
      },
    ]);
  });

  test("GET returns latest approved import by symbol for authorized reads when listing id is absent", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    const url = "http://localhost/api/company/facts?symbol=VOD";
    const authHeaders = createInternalPersistenceHeaders({
      secret: "secret",
      method: "GET",
      url,
      nonce: "company-facts-symbol-import-read-test",
      timestampMs: Date.now(),
    });
    const queryCalls: unknown[] = [];
    ConvexHttpClient.prototype.query = async (name, args) => {
      queryCalls.push({ name, args });
      if (String(name) !== "imports:listBySymbol") {
        return null;
      }
      return [
        {
          symbol: "VOD",
          name: "Vodafone Group Public Limited Company",
          currency: "GBP",
          updatedAt: 2_000,
          facts: {
            statements: [
              {
                period_end: "2025-03-31",
                period_type: "FY",
                revenue: 37_448_000_000,
                shares_outstanding: 24_100_000_000,
              },
            ],
          },
        },
      ];
    };
    globalThis.fetch = async () => {
      throw new Error(
        "EDGAR should not be called when approved imported facts exist",
      );
    };

    const response = await GET(
      new Request(url, {
        headers: {
          ...authHeaders,
          "x-vercel-forwarded-for": "203.0.113.48",
        },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(queryCalls).toEqual([
      { name: "imports:listBySymbol", args: { syncToken: "sync-token", symbol: "VOD", limit: 1 } },
    ]);
    expect(payload.source).toBe("import");
    expect(payload.statements[0].period_end).toBe("2025-03-31");
  });
});
