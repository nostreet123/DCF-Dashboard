import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "crypto";

import { POST } from "../app/api/company/import/approve/route";
import { POST as browserApprovePost } from "../app/api/company/import/approve/browser/route";
import { createInternalPersistenceHeaders } from "../app/api/_lib/internalAuth";
import { resetRateLimitStateForTests } from "../app/api/_lib/rateLimit";
import { installSecurityMutationsMock } from "./helpers/securityMutationsMock";

const originalInternalPersistenceKey = process.env.INTERNAL_PERSISTENCE_KEY;
const originalConvexUrl = process.env.CONVEX_URL;
const originalSyncToken = process.env.DAMODARAN_SYNC_TOKEN;
const originalDcfEngineUrl = process.env.DCF_ENGINE_URL;
const originalAllowUnsigned = process.env.DCF_ENGINE_ALLOW_UNSIGNED;
const originalBrowserWrites = process.env.IMPORT_APPROVAL_BROWSER_WRITES;
const originalBrowserApprovalTokenHash = process.env.IMPORT_APPROVAL_BROWSER_TOKEN_SHA256;
const originalFetch = globalThis.fetch;

let restoreSecurityMock: (() => void) | null = null;
let mutationCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

const sha256Hex = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

beforeEach(() => {
  process.env.CONVEX_URL = "https://example.convex.cloud";
  process.env.DAMODARAN_SYNC_TOKEN = "sync-token";
  process.env.DCF_ENGINE_URL = "http://engine.example";
  process.env.DCF_ENGINE_ALLOW_UNSIGNED = "1";
  mutationCalls = [];
  const securityMock = installSecurityMutationsMock({
    fallbackMutation: (name, args) => {
      mutationCalls.push({ name, args });
      return {};
    },
  });
  restoreSecurityMock = securityMock.restore;
});

afterEach(() => {
  resetRateLimitStateForTests();
  if (restoreSecurityMock) {
    restoreSecurityMock();
  }
  restoreSecurityMock = null;
  if (originalInternalPersistenceKey === undefined) {
    delete process.env.INTERNAL_PERSISTENCE_KEY;
  } else {
    process.env.INTERNAL_PERSISTENCE_KEY = originalInternalPersistenceKey;
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
  if (originalBrowserWrites === undefined) {
    delete process.env.IMPORT_APPROVAL_BROWSER_WRITES;
  } else {
    process.env.IMPORT_APPROVAL_BROWSER_WRITES = originalBrowserWrites;
  }
  if (originalBrowserApprovalTokenHash === undefined) {
    delete process.env.IMPORT_APPROVAL_BROWSER_TOKEN_SHA256;
  } else {
    process.env.IMPORT_APPROVAL_BROWSER_TOKEN_SHA256 = originalBrowserApprovalTokenHash;
  }
  globalThis.fetch = originalFetch;
});

describe("company import approval route", () => {
  test("rejects unauthenticated approval requests", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";

    const response = await POST(
      new Request("http://localhost/api/company/import/approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vercel-forwarded-for": "203.0.113.50",
        },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(401);
  });

  test("validates payload after internal approval auth succeeds", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    const body = JSON.stringify({});
    const authHeaders = createInternalPersistenceHeaders({
      secret: "secret",
      method: "POST",
      url: "http://localhost/api/company/import/approve",
      body,
      nonce: "import-approve-auth-test",
      timestampMs: Date.now(),
    });

    const response = await POST(
      new Request("http://localhost/api/company/import/approve", {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
          "x-vercel-forwarded-for": "203.0.113.51",
        },
        body,
      }),
    );

    expect(response.status).toBe(400);
  });

  test("preserves decimal comma values in reviewed import units", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          base: { valuation: 10 },
          bull: { valuation: 12 },
          bear: { valuation: 8 },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    const body = JSON.stringify({
      company: {
        id: "XTSE:SHOP",
        symbol: "SHOP",
        name: "Shopify Inc.",
        currency: "USD",
        coverageState: "import_required",
      },
      review: {
        chosenPeriodEnd: "2024-12-31",
        missingRequiredFields: [],
        notes: [],
        isValuationReady: true,
        fields: [
          { field: "periodEnd", value: "2024-12-31", confirmed: true },
          { field: "filingCurrency", value: "USD", confirmed: true },
          { field: "revenue", value: "1,2 million", confirmed: true },
          { field: "cash", value: "0,5m", confirmed: true },
          { field: "debt", value: "250k", confirmed: true },
          { field: "sharesOutstanding", value: "2,4m", confirmed: true },
        ],
      },
      artifacts: [],
    });
    const authHeaders = createInternalPersistenceHeaders({
      secret: "secret",
      method: "POST",
      url: "http://localhost/api/company/import/approve",
      body,
      nonce: "import-approve-decimal-comma-test",
      timestampMs: Date.now(),
    });

    const response = await POST(
      new Request("http://localhost/api/company/import/approve", {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
          "x-vercel-forwarded-for": "203.0.113.57",
        },
        body,
      }),
    );

    expect(response.status).toBe(200);
    const approvalCall = mutationCalls.find((call) => call.name === "imports:approveImportedFacts");
    const facts = approvalCall?.args.facts as {
      statements?: Array<{ revenue?: number; cash?: number; debt?: number; sharesOutstanding?: number }>;
    };
    expect(facts.statements?.[0]).toMatchObject({
      revenue: 1_200_000,
      cash: 500_000,
      debt: 250_000,
      sharesOutstanding: 2_400_000,
    });
  });

  test("preserves single comma thousands separators in reviewed import units", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          base: { valuation: 10 },
          bull: { valuation: 12 },
          bear: { valuation: 8 },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    const body = JSON.stringify({
      company: {
        id: "XTSE:SHOP",
        symbol: "SHOP",
        name: "Shopify Inc.",
        currency: "USD",
        coverageState: "import_required",
      },
      review: {
        chosenPeriodEnd: "2024-12-31",
        missingRequiredFields: [],
        notes: [],
        isValuationReady: true,
        fields: [
          { field: "periodEnd", value: "2024-12-31", confirmed: true },
          { field: "filingCurrency", value: "USD", confirmed: true },
          { field: "revenue", value: "1,234 million", confirmed: true },
          { field: "cash", value: "1,234", confirmed: true },
          { field: "debt", value: "12,345", confirmed: true },
          { field: "sharesOutstanding", value: "2,400k", confirmed: true },
        ],
      },
      artifacts: [],
    });
    const authHeaders = createInternalPersistenceHeaders({
      secret: "secret",
      method: "POST",
      url: "http://localhost/api/company/import/approve",
      body,
      nonce: "import-approve-thousands-comma-test",
      timestampMs: Date.now(),
    });

    const response = await POST(
      new Request("http://localhost/api/company/import/approve", {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
          "x-vercel-forwarded-for": "203.0.113.58",
        },
        body,
      }),
    );

    expect(response.status).toBe(200);
    const approvalCall = mutationCalls.find((call) => call.name === "imports:approveImportedFacts");
    const facts = approvalCall?.args.facts as {
      statements?: Array<{ revenue?: number; cash?: number; debt?: number; sharesOutstanding?: number }>;
    };
    expect(facts.statements?.[0]).toMatchObject({
      revenue: 1_234_000_000,
      cash: 1_234,
      debt: 12_345,
      sharesOutstanding: 2_400_000,
    });
  });

  test("preserves bare m million suffix in reviewed import values", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    globalThis.fetch = async (url) => {
      expect(String(url)).toBe("http://engine.example/dcf/compute");
      return new Response(
        JSON.stringify({
          base: { valuation: 10 },
          bull: { valuation: 12 },
          bear: { valuation: 8 },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    };
    const body = JSON.stringify({
      company: {
        id: "XTSE:SHOP",
        symbol: "SHOP",
        name: "Shopify Inc.",
        currency: "USD",
        coverageState: "import_required",
      },
      review: {
        chosenPeriodEnd: "2024-12-31",
        missingRequiredFields: [],
        notes: [],
        isValuationReady: true,
        fields: [
          { field: "periodEnd", value: "2024-12-31", confirmed: true },
          { field: "filingCurrency", value: "USD", confirmed: true },
          { field: "revenue", value: "10m", confirmed: true },
          { field: "cash", value: "2m", confirmed: true },
          { field: "debt", value: "1m", confirmed: true },
          { field: "sharesOutstanding", value: "5m", confirmed: true },
        ],
      },
      artifacts: [],
    });
    const authHeaders = createInternalPersistenceHeaders({
      secret: "secret",
      method: "POST",
      url: "http://localhost/api/company/import/approve",
      body,
      nonce: "import-approve-million-suffix-test",
      timestampMs: Date.now(),
    });

    const response = await POST(
      new Request("http://localhost/api/company/import/approve", {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
          "x-vercel-forwarded-for": "203.0.113.52",
        },
        body,
      }),
    );

    expect(response.status).toBe(200);
    const approvalCall = mutationCalls.find((call) => call.name === "imports:approveImportedFacts");
    const facts = approvalCall?.args.facts as {
      statements?: Array<{ revenue?: number; cash?: number; debt?: number; sharesOutstanding?: number }>;
    };
    expect(facts.statements?.[0]).toMatchObject({
      revenue: 10_000_000,
      cash: 2_000_000,
      debt: 1_000_000,
      sharesOutstanding: 5_000_000,
    });
  });

  test("preserves compact bn and k suffixes in reviewed import values", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          base: { valuation: 10 },
          bull: { valuation: 12 },
          bear: { valuation: 8 },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    const body = JSON.stringify({
      company: {
        id: "XTSE:SHOP",
        symbol: "SHOP",
        name: "Shopify Inc.",
        currency: "USD",
        coverageState: "import_required",
      },
      review: {
        chosenPeriodEnd: "2024-12-31",
        missingRequiredFields: [],
        notes: [],
        isValuationReady: true,
        fields: [
          { field: "periodEnd", value: "2024-12-31", confirmed: true },
          { field: "filingCurrency", value: "USD", confirmed: true },
          { field: "revenue", value: "1.2bn", confirmed: true },
          { field: "cash", value: "250k", confirmed: true },
          { field: "debt", value: "3bn", confirmed: true },
          { field: "sharesOutstanding", value: "5m", confirmed: true },
        ],
      },
      artifacts: [],
    });
    const authHeaders = createInternalPersistenceHeaders({
      secret: "secret",
      method: "POST",
      url: "http://localhost/api/company/import/approve",
      body,
      nonce: "import-approve-compact-units-test",
      timestampMs: Date.now(),
    });

    const response = await POST(
      new Request("http://localhost/api/company/import/approve", {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
          "x-vercel-forwarded-for": "203.0.113.56",
        },
        body,
      }),
    );

    expect(response.status).toBe(200);
    const approvalCall = mutationCalls.find((call) => call.name === "imports:approveImportedFacts");
    const facts = approvalCall?.args.facts as {
      statements?: Array<{ revenue?: number; cash?: number; debt?: number }>;
    };
    expect(facts.statements?.[0]).toMatchObject({
      revenue: 1_200_000_000,
      cash: 250_000,
      debt: 3_000_000_000,
    });
  });

  test("normalizes reviewer period end before computing imports", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    globalThis.fetch = async (url, init) => {
      expect(String(url)).toBe("http://engine.example/dcf/compute");
      const requestBody = JSON.parse(String(init?.body)) as { statements?: Array<{ periodEnd?: string }> };
      expect(requestBody.statements?.[0]?.periodEnd).toBe("2025-03-31");
      return new Response(
        JSON.stringify({
          base: { valuation: 10 },
          bull: { valuation: 12 },
          bear: { valuation: 8 },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    };
    const body = JSON.stringify({
      company: {
        id: "XTSE:SHOP",
        symbol: "SHOP",
        name: "Shopify Inc.",
        currency: "USD",
        coverageState: "import_required",
      },
      review: {
        chosenPeriodEnd: "31/03/2025",
        missingRequiredFields: [],
        notes: [],
        isValuationReady: true,
        fields: [
          { field: "periodEnd", value: "31/03/2025", confirmed: true },
          { field: "filingCurrency", value: "USD", confirmed: true },
          { field: "revenue", value: "10m", confirmed: true },
          { field: "cash", value: "2m", confirmed: true },
          { field: "debt", value: "1m", confirmed: true },
          { field: "sharesOutstanding", value: "5m", confirmed: true },
        ],
      },
      artifacts: [],
    });
    const authHeaders = createInternalPersistenceHeaders({
      secret: "secret",
      method: "POST",
      url: "http://localhost/api/company/import/approve",
      body,
      nonce: "import-approve-period-normalize-test",
      timestampMs: Date.now(),
    });

    const response = await POST(
      new Request("http://localhost/api/company/import/approve", {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
          "x-vercel-forwarded-for": "203.0.113.54",
        },
        body,
      }),
    );

    expect(response.status).toBe(200);
  });

  test("browser approval wrapper stays disabled unless explicitly enabled", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    delete process.env.IMPORT_APPROVAL_BROWSER_WRITES;

    const response = await browserApprovePost(
      new Request("http://localhost/api/company/import/approve/browser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    );

    expect(response.status).toBe(404);
  });

  test("browser approval wrapper requires an approval token before signing", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    process.env.IMPORT_APPROVAL_BROWSER_WRITES = "1";
    process.env.IMPORT_APPROVAL_BROWSER_TOKEN_SHA256 = sha256Hex("correct-token");

    const response = await browserApprovePost(
      new Request("http://localhost/api/company/import/approve/browser", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-import-approval-token": "wrong-token",
        },
        body: "{}",
      }),
    );

    expect(response.status).toBe(401);
  });

  test("browser approval wrapper signs the internal approval request", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    process.env.IMPORT_APPROVAL_BROWSER_WRITES = "1";
    process.env.IMPORT_APPROVAL_BROWSER_TOKEN_SHA256 = sha256Hex("correct-token");
    globalThis.fetch = async (url) => {
      expect(String(url)).toBe("http://engine.example/dcf/compute");
      return new Response(
        JSON.stringify({
          base: { valuation: 10 },
          bull: { valuation: 12 },
          bear: { valuation: 8 },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    };
    const body = JSON.stringify({
      company: {
        id: "XTSE:SHOP",
        symbol: "SHOP",
        name: "Shopify Inc.",
        currency: "USD",
        coverageState: "import_required",
      },
      review: {
        chosenPeriodEnd: "2024-12-31",
        missingRequiredFields: [],
        notes: [],
        isValuationReady: true,
        fields: [
          { field: "periodEnd", value: "2024-12-31", confirmed: true },
          { field: "filingCurrency", value: "USD", confirmed: true },
          { field: "revenue", value: "10m", confirmed: true },
          { field: "cash", value: "2m", confirmed: true },
          { field: "debt", value: "1m", confirmed: true },
          { field: "sharesOutstanding", value: "5m", confirmed: true },
        ],
      },
      artifacts: [],
    });

    const response = await browserApprovePost(
      new Request("http://localhost/api/company/import/approve/browser", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-import-approval-token": "correct-token",
          "x-vercel-forwarded-for": "203.0.113.55",
        },
        body,
      }),
    );

    expect(response.status).toBe(200);
    expect(mutationCalls.some((call) => call.name === "imports:approveImportedFacts")).toBe(true);
  });
});
