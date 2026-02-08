import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { DcfEngineHttpError, fetchDcfEngine } from "../app/api/_lib/dcfEngine.ts";
import { mapDcfEngineError } from "../app/api/_lib/dcfEngineErrors.ts";

const originalFetch = globalThis.fetch;
const originalEngineUrl = process.env.DCF_ENGINE_URL;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalEngineUrl === undefined) {
    delete process.env.DCF_ENGINE_URL;
  } else {
    process.env.DCF_ENGINE_URL = originalEngineUrl;
  }
});

describe("fetchDcfEngine", () => {
  it("throws a typed error with upstream status", async () => {
    process.env.DCF_ENGINE_URL = "http://dcf-engine.test";
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          detail: [{ msg: "validation failed" }],
        }),
        { status: 422, headers: { "content-type": "application/json" } },
      );

    await assert.rejects(
      () =>
        fetchDcfEngine("/dcf/compute", {
          method: "POST",
          body: "{}",
        }),
      (error: unknown) => {
        assert.ok(error instanceof DcfEngineHttpError);
        assert.equal(error.status, 422);
        assert.match(error.message, /validation/i);
        return true;
      },
    );
  });
});

describe("mapDcfEngineError", () => {
  it("maps 422 validation errors to BAD_REQUEST", () => {
    const mapped = mapDcfEngineError(
      new DcfEngineHttpError(422, "invalid payload", { detail: [] }),
      "fallback",
    );
    assert.deepEqual(mapped, {
      code: "BAD_REQUEST",
      message: "invalid payload",
      status: 400,
      upstreamStatus: 422,
    });
  });

  it("maps non-validation upstream errors to DCF_ENGINE_ERROR", () => {
    const mapped = mapDcfEngineError(
      new DcfEngineHttpError(500, "upstream failed", { detail: "boom" }),
      "fallback",
    );
    assert.deepEqual(mapped, {
      code: "DCF_ENGINE_ERROR",
      message: "upstream failed",
      status: 502,
      upstreamStatus: 500,
    });
  });

  it("falls back for generic errors", () => {
    const mapped = mapDcfEngineError(new Error("network down"), "fallback");
    assert.deepEqual(mapped, {
      code: "DCF_ENGINE_ERROR",
      message: "network down",
      status: 502,
    });
  });
});
