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
    const runs = [{
      _id: "run-1",
      createdAt: 1700000000000,
      symbol: "AAPL",
      status: "success",
      resultSummary: {
        base: {
          fairValuePerShare: 145.12,
          enterpriseValue: 999_000_000,
        },
        bull: { fair_value_per_share: 188.5 },
        bear: { fairValue: 101.25 },
        kpis: {
          history: [{ revenue: 987_654_321, cash: 12_345_678 }],
        },
        monteCarlo: {
          summary: { runs: 1000, p10: 120, p90: 200 },
        },
      },
      inputs: { revenueGrowth: 0.1 },
      normalizedInputs: { revenueGrowth: 0.1 },
      provenance: { source: "private filing cache" },
      requestId: "request-123",
      traceStorage: "external",
      traceId: "trace-123",
      traceByteSize: 12345,
    }];
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
    expect(await response.json()).toEqual({
      runs: [{
        _id: "run-1",
        createdAt: 1700000000000,
        symbol: "AAPL",
        status: "success",
        resultSummary: {
          base: { fairValuePerShare: 145.12 },
          bull: { fair_value_per_share: 188.5 },
          bear: { fairValue: 101.25 },
        },
      }],
    });
  });

  test("returns normalized replay details without internal persistence headers when enabled", async () => {
    process.env.VALUATION_HISTORY_BROWSER_READS = "1";
    ConvexHttpClient.prototype.query = async () => ({
      run: {
        _id: "run-123",
        createdAt: 1700000000000,
        symbol: "AAPL",
        inputs: {
          scenario: "bull",
          bull: {
            revenueGrowth: 0.22,
            ebitMargin: 0.31,
            wacc: 0.0875,
            gStable: 0.0325,
          },
        },
        traceStorage: "inline",
        provenance: {
          source: "private filing cache",
          sourceLinks: [{ title: "Private artifact", url: "convex-storage:secret" }],
        },
        trace: {
          base: {
            valuation: { fairValuePerShare: 145.12 },
            trace: { forecast: { years: [2025], revenue: [100], ebit: [20], nopat: [16], fcff: [12] } },
          },
          bull: {
            valuation: { fairValuePerShare: 182.3 },
            trace: { forecast: { years: [2025], revenue: [130], ebit: [32], nopat: [26], fcff: [21] } },
          },
          bear: { valuation: { fairValuePerShare: 109.8 } },
          sensitivity: {
            growthOffsets: [-2, 0, 2],
            waccOffsets: [-0.01, 0, 0.01],
            values: [[140, 145, 150]],
          },
          monteCarlo: {
            histogram: { binCenters: [120, 130], density: [0.4, 1] },
            summary: {
              min: 100,
              max: 200,
              mean: 150,
              median: 151,
              p10: 118.1,
              p25: 125,
              p75: 160,
              p90: 171.4,
            },
            runs: 5000,
          },
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
    const json = await response.json();
    expect(json).toMatchObject({
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
    expect(json.replay.provenance).toBeUndefined();
    expect(json.replay.statementHistory).toEqual([]);
    expect(json.replay.projections).toEqual([]);
    expect(json.replay.kpis).toEqual([]);
    expect(json.replay.sensitivity).toBeUndefined();
    expect(json.replay.sensitivityMatrix).toBeUndefined();
    expect(json.replay.monteCarloSummary).toBeUndefined();
    expect(json.replay.assumptions).toBeUndefined();
  });
});
