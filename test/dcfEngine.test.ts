import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DcfEngineHttpError, fetchDcfEngine } from "../app/api/_lib/dcfEngine.ts";

const originalFetch = globalThis.fetch;

describe("fetchDcfEngine", () => {
  beforeEach(() => {
    process.env.DCF_ENGINE_URL = "http://example.test";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.DCF_ENGINE_URL;
  });

  test("returns parsed JSON on success", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    const result = await fetchDcfEngine<{ ok: boolean }>("/dcf/compute");
    expect(result).toEqual({ ok: true });
  });

  test("throws message from JSON error payload", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: "Boom" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });

    try {
      await fetchDcfEngine("/dcf/compute");
      throw new Error("Expected fetchDcfEngine to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(DcfEngineHttpError);
      expect((error as DcfEngineHttpError).status).toBe(500);
      expect((error as Error).message).toContain("Boom");
    }
  });

  test("throws with status for non-JSON error payloads", async () => {
    globalThis.fetch = async () =>
      new Response("Internal Server Error", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      });

    try {
      await fetchDcfEngine("/dcf/compute");
      throw new Error("Expected fetchDcfEngine to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(DcfEngineHttpError);
      expect((error as DcfEngineHttpError).status).toBe(500);
      expect((error as Error).message).toContain("DCF engine error (500)");
    }
  });

  test("throws on non-JSON success payloads", async () => {
    globalThis.fetch = async () =>
      new Response("ok", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });

    await expect(fetchDcfEngine("/dcf/compute")).rejects.toThrow(
      "Unexpected DCF engine response (200)",
    );
  });
});
