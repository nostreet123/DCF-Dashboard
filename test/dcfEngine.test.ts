/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DcfEngineHttpError, fetchDcfEngine } from "../app/api/_lib/dcfEngine";

const originalFetch = globalThis.fetch;
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
});
