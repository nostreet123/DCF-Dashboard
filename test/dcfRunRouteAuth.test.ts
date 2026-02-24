/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ConvexHttpClient } from "convex/browser";

import { POST as dcfRunPost } from "../app/api/dcf/run/route";
import { internalPersistenceHeaderName } from "../app/api/_lib/internalAuth";

const originalFetch = globalThis.fetch;
const originalConvexUrl = process.env.CONVEX_URL;
const originalSyncToken = process.env.DAMODARAN_SYNC_TOKEN;
const originalInternalKey = process.env.INTERNAL_PERSISTENCE_KEY;
const originalMutation = ConvexHttpClient.prototype.mutation;
const noopPreconnect: typeof fetch.preconnect = () => {};

function createMockFetch(
  impl: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>,
): typeof fetch {
  return Object.assign(impl, { preconnect: noopPreconnect });
}

beforeEach(() => {
  process.env.DCF_ENGINE_URL = "http://example.test";
  process.env.CONVEX_URL = "https://example.convex.cloud";
  process.env.DAMODARAN_SYNC_TOKEN = "sync-token";
  process.env.INTERNAL_PERSISTENCE_KEY = "internal-key";
});

afterEach(() => {
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
    globalThis.fetch = createMockFetch(async () =>
      new Response(JSON.stringify({ base: {}, bull: {}, bear: {}, kpis: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));

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
    globalThis.fetch = createMockFetch(async () =>
      new Response(JSON.stringify({ base: {}, bull: {}, bear: {}, kpis: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));

    const response = await dcfRunPost(
      new Request("http://localhost/api/dcf/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [internalPersistenceHeaderName]: "internal-key",
        },
        body: JSON.stringify({ requestId: "req-2" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mutationCalls).toBe(1);
  });
});
