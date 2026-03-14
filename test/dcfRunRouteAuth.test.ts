import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { POST as dcfRunPost } from "../app/api/dcf/run/route";
import { createInternalPersistenceHeaders } from "../app/api/_lib/internalAuth";
import { resetRateLimitStateForTests } from "../app/api/_lib/rateLimit";
import { installSecurityMutationsMock } from "./helpers/securityMutationsMock";

const originalFetch = globalThis.fetch;
const originalConvexUrl = process.env.CONVEX_URL;
const originalSyncToken = process.env.DAMODARAN_SYNC_TOKEN;
const originalInternalKey = process.env.INTERNAL_PERSISTENCE_KEY;
const originalAllowUnsigned = process.env.DCF_ENGINE_ALLOW_UNSIGNED;

let restoreSecurityMock: (() => void) | null = null;
let fallbackMutation:
  | ((name: string, args: Record<string, unknown>) => unknown)
  | null = null;

beforeEach(() => {
  process.env.DCF_ENGINE_URL = "http://example.test";
  process.env.DCF_ENGINE_ALLOW_UNSIGNED = "1";
  process.env.CONVEX_URL = "https://example.convex.cloud";
  process.env.DAMODARAN_SYNC_TOKEN = "sync-token";
  process.env.INTERNAL_PERSISTENCE_KEY = "internal-key";
  fallbackMutation = null;
  const securityMock = installSecurityMutationsMock({
    fallbackMutation: async (name, args) => {
      if (fallbackMutation) {
        return fallbackMutation(name, args);
      }
      return {};
    },
  });
  restoreSecurityMock = securityMock.restore;
});

afterEach(() => {
  resetRateLimitStateForTests();
  globalThis.fetch = originalFetch;
  if (restoreSecurityMock) {
    restoreSecurityMock();
  }
  restoreSecurityMock = null;
  fallbackMutation = null;

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

  if (originalInternalKey === undefined) {
    delete process.env.INTERNAL_PERSISTENCE_KEY;
  } else {
    process.env.INTERNAL_PERSISTENCE_KEY = originalInternalKey;
  }
  if (originalAllowUnsigned === undefined) {
    delete process.env.DCF_ENGINE_ALLOW_UNSIGNED;
  } else {
    process.env.DCF_ENGINE_ALLOW_UNSIGNED = originalAllowUnsigned;
  }
});

describe("dcf run persistence auth", () => {
  test("skips persistence when internal header is missing", async () => {
    let valuationMutationCalls = 0;
    fallbackMutation = (name) => {
      if (name === "valuations:create") {
        valuationMutationCalls += 1;
        return { runId: "run-id" };
      }
      return {};
    };
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ base: {}, bull: {}, bear: {}, kpis: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    const response = await dcfRunPost(
      new Request("http://localhost/api/dcf/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vercel-forwarded-for": "203.0.113.60",
        },
        body: JSON.stringify({ requestId: "req-1" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(valuationMutationCalls).toBe(0);
  });

  test("persists when internal header is valid", async () => {
    let valuationMutationCalls = 0;
    fallbackMutation = (name) => {
      if (name === "valuations:create") {
        valuationMutationCalls += 1;
        return { runId: "run-id" };
      }
      return {};
    };
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ base: {}, bull: {}, bear: {}, kpis: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    const body = JSON.stringify({ requestId: "req-2" });
    const authHeaders = createInternalPersistenceHeaders({
      secret: "internal-key",
      method: "POST",
      url: "http://localhost/api/dcf/run",
      body,
      nonce: "dcf-run-auth-test",
      timestampMs: Date.now(),
    });
    const response = await dcfRunPost(
      new Request("http://localhost/api/dcf/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vercel-forwarded-for": "203.0.113.61",
          ...authHeaders,
        },
        body,
      }),
    );

    expect(response.status).toBe(200);
    expect(valuationMutationCalls).toBe(1);
  });
});
