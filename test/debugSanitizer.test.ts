import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  sanitizeDebugEventData,
  sanitizeDebugInputs,
} from "../app/api/_lib/debugSanitizer.ts";

describe("debugSanitizer", () => {
  it("keeps only allowlisted input fields", () => {
    const sanitized = sanitizeDebugInputs({
      requestId: "req-1",
      symbol: "AAPL",
      secretToken: "should-not-survive",
      base: {
        revenueGrowth: 0.05,
        ebitMargin: 0.2,
        hidden: "drop-me",
      },
      monteCarlo: {
        runs: 2000,
        bins: 80,
        seed: 12345,
      },
    });

    assert.deepEqual(sanitized, {
      requestId: "req-1",
      symbol: "AAPL",
      base: {
        revenueGrowth: 0.05,
        ebitMargin: 0.2,
      },
      monteCarlo: {
        runs: 2000,
        bins: 80,
      },
    });
  });

  it("keeps only allowlisted event data fields", () => {
    const sanitized = sanitizeDebugEventData({
      status: "success",
      code: "OK",
      upstreamStatus: 422,
      traceByteSize: 1234,
      token: "drop-me",
      nested: { value: true },
    });
    assert.deepEqual(sanitized, {
      status: "success",
      code: "OK",
      upstreamStatus: 422,
      traceByteSize: 1234,
    });
  });
});
