import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  adoptRequestId,
  createDebugContext,
  shouldEmitDebugEvent,
  withDebugHeaders,
} from "../app/api/_lib/debugContext.ts";

describe("debugContext", () => {
  it("uses requestId candidate as correlation id", () => {
    const request = new Request("http://localhost/api/dcf/run");
    const context = createDebugContext(request, "/api/dcf/run", "req-123");
    assert.equal(context.correlationId, "req-123");
  });

  it("falls back to x-debug-id header", () => {
    const request = new Request("http://localhost/api/dcf/run", {
      headers: { "x-debug-id": "header-id" },
    });
    const context = createDebugContext(request, "/api/dcf/run");
    assert.equal(context.correlationId, "header-id");
  });

  it("generates a correlation id when no id is provided", () => {
    const request = new Request("http://localhost/api/dcf/run");
    const context = createDebugContext(request, "/api/dcf/run");
    assert.ok(context.correlationId.length > 0);
  });

  it("applies debug level override only when enabled", () => {
    const prevAllow = process.env.ALLOW_DEBUG_LEVEL_OVERRIDE;
    const prevDefault = process.env.DEBUG_LEVEL_DEFAULT;
    process.env.DEBUG_LEVEL_DEFAULT = "error";
    process.env.ALLOW_DEBUG_LEVEL_OVERRIDE = "true";

    try {
      const request = new Request("http://localhost/api/dcf/run", {
        headers: { "x-debug-level": "verbose" },
      });
      const context = createDebugContext(request, "/api/dcf/run");
      assert.equal(context.debugLevel, "verbose");
    } finally {
      if (prevAllow === undefined) {
        delete process.env.ALLOW_DEBUG_LEVEL_OVERRIDE;
      } else {
        process.env.ALLOW_DEBUG_LEVEL_OVERRIDE = prevAllow;
      }
      if (prevDefault === undefined) {
        delete process.env.DEBUG_LEVEL_DEFAULT;
      } else {
        process.env.DEBUG_LEVEL_DEFAULT = prevDefault;
      }
    }
  });

  it("adoptRequestId updates correlation id when request id is present", () => {
    const request = new Request("http://localhost/api/dcf/run");
    const context = createDebugContext(request, "/api/dcf/run");
    const adopted = adoptRequestId(context, "req-456");
    assert.equal(adopted.correlationId, "req-456");
  });

  it("sets debug headers on a response object", () => {
    const request = new Request("http://localhost/api/dcf/run");
    const context = createDebugContext(request, "/api/dcf/run", "req-789");
    const responseLike = { headers: new Headers() } as any;
    withDebugHeaders(responseLike, context);
    assert.equal(responseLike.headers.get("x-debug-id"), "req-789");
    assert.equal(responseLike.headers.get("x-debug-level"), context.debugLevel);
  });

  it("supports tiered event emission", () => {
    assert.equal(shouldEmitDebugEvent("error", "standard"), false);
    assert.equal(shouldEmitDebugEvent("standard", "error"), true);
    assert.equal(shouldEmitDebugEvent("verbose", "standard"), true);
  });
});
