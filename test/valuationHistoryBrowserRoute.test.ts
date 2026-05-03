/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ConvexHttpClient } from "convex/browser";

import { GET as listHistory } from "../app/api/dcf/history/browser/route";
import { GET as getHistoryRun } from "../app/api/dcf/history/browser/[runId]/route";
import { resetRateLimitStateForTests } from "../app/api/_lib/rateLimit";
import { installSecurityMutationsMock } from "./helpers/securityMutationsMock";

const originalBrowserReads = process.env.VALUATION_HISTORY_BROWSER_READS;
const originalConvexUrl = process.env.CONVEX_URL;
const originalSyncToken = process.env.DAMODARAN_SYNC_TOKEN;
const originalQuery = ConvexHttpClient.prototype.query;

let restoreSecurityMock: (() => void) | null = null;

beforeEach(() => {
  process.env.CONVEX_URL = "https://example.convex.cloud";
  process.env.DAMODARAN_SYNC_TOKEN = "sync-token";
  const securityMock = installSecurityMutationsMock();
  restoreSecurityMock = securityMock.restore;
});

afterEach(() => {
  resetRateLimitStateForTests();
  ConvexHttpClient.prototype.query = originalQuery;
  if (restoreSecurityMock) {
    restoreSecurityMock();
  }
  restoreSecurityMock = null;

  if (originalBrowserReads === undefined) {
    delete process.env.VALUATION_HISTORY_BROWSER_READS;
  } else {
    process.env.VALUATION_HISTORY_BROWSER_READS = originalBrowserReads;
  }
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
});

describe("browser valuation history routes", () => {
  test("returns not found unless browser reads are explicitly enabled", async () => {
    delete process.env.VALUATION_HISTORY_BROWSER_READS;

    const response = await listHistory(
      new Request("http://localhost/api/dcf/history/browser?symbol=AAPL"),
    );

    expect(response.status).toBe(404);
  });

  test("lists ticker history without internal persistence headers when enabled", async () => {
    process.env.VALUATION_HISTORY_BROWSER_READS = "1";
    const runs = [{ _id: "run-1", symbol: "AAPL", status: "success" }];
    let capturedName: string | undefined;
    let capturedArgs: Record<string, unknown> | undefined;
    ConvexHttpClient.prototype.query = async (name, args) => {
      capturedName = String(name);
      capturedArgs = args as Record<string, unknown>;
      return runs;
    };

    const response = await listHistory(
      new Request("http://localhost/api/dcf/history/browser?symbol=AAPL&limit=5", {
        headers: { "x-vercel-forwarded-for": "203.0.113.150" },
      }),
    );

    expect(response.status).toBe(200);
    expect(capturedName).toBe("valuations:listByTicker");
    expect(capturedArgs).toEqual({
      syncToken: "sync-token",
      symbol: "AAPL",
      limit: 5,
    });
    expect(await response.json()).toEqual({ runs });
  });

  test("returns normalized replay details without internal persistence headers when enabled", async () => {
    process.env.VALUATION_HISTORY_BROWSER_READS = "1";
    ConvexHttpClient.prototype.query = async () => ({
      run: {
        _id: "run-123",
        createdAt: 1700000000000,
        symbol: "AAPL",
        traceStorage: "inline",
        trace: {
          base: { valuation: { fairValuePerShare: 145.12 } },
          bull: { valuation: { fairValuePerShare: 182.3 } },
          bear: { valuation: { fairValuePerShare: 109.8 } },
        },
      },
    });

    const response = await getHistoryRun(
      new Request("http://localhost/api/dcf/history/browser/run-123", {
        headers: { "x-vercel-forwarded-for": "203.0.113.151" },
      }),
      { params: Promise.resolve({ runId: "run-123" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      replay: {
        runId: "run-123",
        ticker: "AAPL",
        createdAt: 1700000000000,
        scenarios: {
          base: { fairValue: 145.12 },
          bull: { fairValue: 182.3 },
          bear: { fairValue: 109.8 },
        },
      },
    });
  });
});
