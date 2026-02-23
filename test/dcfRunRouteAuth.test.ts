import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ConvexHttpClient } from "convex/browser";

import { POST as dcfRunPost } from "../app/api/dcf/run/route";
import { createInternalPersistenceHeaders } from "../app/api/_lib/internalAuth";
import { resetRateLimitStateForTests } from "../app/api/_lib/rateLimit";

const originalFetch = globalThis.fetch;
const originalConvexUrl = process.env.CONVEX_URL;
const originalSyncToken = process.env.DAMODARAN_SYNC_TOKEN;
const originalInternalKey = process.env.INTERNAL_PERSISTENCE_KEY;
const originalMutation = ConvexHttpClient.prototype.mutation;

beforeEach(() => {
  process.env.DCF_ENGINE_URL = "http://example.test";
  process.env.CONVEX_URL = "https://example.convex.cloud";
  process.env.DAMODARAN_SYNC_TOKEN = "sync-token";
  process.env.INTERNAL_PERSISTENCE_KEY = "internal-key";
});

afterEach(() => {
  resetRateLimitStateForTests();
  globalThis.fetch = originalFetch;
  ConvexHttpClient.prototype.mutation = originalMutation;

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
});

describe("dcf run persistence auth", () => {
  test("skips persistence when internal header is missing", async () => {
    let mutationCalls = 0;
    ConvexHttpClient.prototype.mutation = async () => {
      mutationCalls += 1;
      return { runId: "run-id" };
    };
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ base: {}, bull: {}, bear: {}, kpis: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    const response = await dcfRunPost(
      new Request("http://localhost/api/dcf/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: "req-1" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mutationCalls).toBe(0);
  });

  test("persists when internal header is valid", async () => {
    let mutationCalls = 0;
    ConvexHttpClient.prototype.mutation = async () => {
      mutationCalls += 1;
      return { runId: "run-id" };
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
          ...authHeaders,
        },
        body,
      }),
    );

    expect(response.status).toBe(200);
    expect(mutationCalls).toBe(1);
  });
});
