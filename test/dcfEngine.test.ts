/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DcfEngineHttpError, fetchDcfEngine } from "../app/api/_lib/dcfEngine";
import {
  internalPersistenceHeaderName,
  internalPersistenceNonceHeaderName,
  internalPersistenceTimestampHeaderName,
} from "../app/api/_lib/internalAuth";

const originalFetch = globalThis.fetch;
const originalInternalKey = process.env.DCF_ENGINE_INTERNAL_KEY;
const noopPreconnect: typeof fetch.preconnect = () => {};

function createMockFetch(
  impl: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>,
): typeof fetch {
  return Object.assign(impl, { preconnect: noopPreconnect });
}

describe("fetchDcfEngine", () => {
  beforeEach(() => {
    process.env.DCF_ENGINE_URL = "http://example.test";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.DCF_ENGINE_URL;
    if (originalInternalKey === undefined) {
      delete process.env.DCF_ENGINE_INTERNAL_KEY;
    } else {
      process.env.DCF_ENGINE_INTERNAL_KEY = originalInternalKey;
    }
  });

  test("returns parsed JSON on success", async () => {
    globalThis.fetch = createMockFetch(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));

    const result = await fetchDcfEngine<{ ok: boolean }>("/dcf/compute");
    expect(result).toEqual({ ok: true });
  });

  test("throws message from JSON error payload", async () => {
    globalThis.fetch = createMockFetch(async () =>
      new Response(JSON.stringify({ message: "Boom" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }));

    await expect(fetchDcfEngine("/dcf/compute")).rejects.toThrow("Boom");
  });

  test("JSON error payload preserves upstream HTTP status", async () => {
    globalThis.fetch = createMockFetch(async () =>
      new Response(JSON.stringify({ message: "Unknown symbol" }), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      }));

    const err = await fetchDcfEngine("/dcf/compute").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DcfEngineHttpError);
    expect((err as DcfEngineHttpError).message).toBe("Unknown symbol");
    expect((err as DcfEngineHttpError).status).toBe(422);
  });

  test("throws with status for non-JSON error payloads", async () => {
    globalThis.fetch = createMockFetch(async () =>
      new Response("Internal Server Error", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      }));

    const err = await fetchDcfEngine("/dcf/compute").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DcfEngineHttpError);
    expect((err as DcfEngineHttpError).status).toBe(500);
    expect((err as DcfEngineHttpError).message).toContain("DCF engine error (500)");
  });

  test("throws on non-JSON success payloads", async () => {
    globalThis.fetch = createMockFetch(async () =>
      new Response("ok", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      }));

    await expect(fetchDcfEngine("/dcf/compute")).rejects.toThrow(
      "Unexpected DCF engine response (200)",
    );
  });

  test("signs outbound GET requests when internal engine key is configured", async () => {
    process.env.DCF_ENGINE_INTERNAL_KEY = "engine-secret";
    let capturedRequest: Request | undefined;
    globalThis.fetch = createMockFetch(async (input, init) => {
      capturedRequest = new Request(input, init);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const result = await fetchDcfEngine<{ ok: boolean }>("/sec/search?q=AAPL&limit=5", {
      method: "GET",
    });

    expect(result).toEqual({ ok: true });
    expect(capturedRequest).toBeDefined();
    expect(capturedRequest?.headers.get(internalPersistenceHeaderName)).toBeString();
    expect(capturedRequest?.headers.get(internalPersistenceTimestampHeaderName)).toBeString();
    expect(capturedRequest?.headers.get(internalPersistenceNonceHeaderName)).toBeString();
  });

  test("signs outbound POST requests using the serialized body", async () => {
    process.env.DCF_ENGINE_INTERNAL_KEY = "engine-secret";
    let capturedRequest: Request | undefined;
    globalThis.fetch = createMockFetch(async (input, init) => {
      capturedRequest = new Request(input, init);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    await fetchDcfEngine<{ ok: boolean }>("/dcf/compute", {
      method: "POST",
      body: JSON.stringify({ symbol: "AAPL" }),
    });

    expect(capturedRequest).toBeDefined();
    expect(capturedRequest?.headers.get(internalPersistenceHeaderName)).toBeString();
    expect(await capturedRequest?.text()).toBe(JSON.stringify({ symbol: "AAPL" }));
  });
});
