import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { GET, POST } from "../app/api/company/facts/route";
import { createInternalPersistenceHeaders } from "../app/api/_lib/internalAuth";
import { resetRateLimitStateForTests } from "../app/api/_lib/rateLimit";
import { installSecurityMutationsMock } from "./helpers/securityMutationsMock";

const originalInternalPersistenceKey = process.env.INTERNAL_PERSISTENCE_KEY;
const originalConvexUrl = process.env.CONVEX_URL;
const originalSyncToken = process.env.DAMODARAN_SYNC_TOKEN;

let restoreSecurityMock: (() => void) | null = null;

beforeEach(() => {
  process.env.CONVEX_URL = "https://example.convex.cloud";
  process.env.DAMODARAN_SYNC_TOKEN = "sync-token";
  const securityMock = installSecurityMutationsMock();
  restoreSecurityMock = securityMock.restore;
});

afterEach(() => {
  resetRateLimitStateForTests();
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
  if (originalInternalPersistenceKey === undefined) {
    delete process.env.INTERNAL_PERSISTENCE_KEY;
  } else {
    process.env.INTERNAL_PERSISTENCE_KEY = originalInternalPersistenceKey;
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
});
