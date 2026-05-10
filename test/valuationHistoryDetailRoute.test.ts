/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ConvexHttpClient } from "convex/browser";

import { GET } from "../app/api/dcf/history/[runId]/route";
import {
  createInternalPersistenceHeaders,
  resetInternalAuthStateForTests,
} from "../app/api/_lib/internalAuth";
import { resetRateLimitStateForTests } from "../app/api/_lib/rateLimit";
import { installSecurityMutationsMock } from "./helpers/securityMutationsMock";

const originalConvexUrl = process.env.CONVEX_URL;
const originalSyncToken = process.env.DAMODARAN_SYNC_TOKEN;
const originalInternalPersistenceKey = process.env.INTERNAL_PERSISTENCE_KEY;
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
  resetInternalAuthStateForTests();
  ConvexHttpClient.prototype.query = originalQuery;
  if (restoreSecurityMock) {
    restoreSecurityMock();
  }
  restoreSecurityMock = null;

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
  if (originalInternalPersistenceKey === undefined) {
    delete process.env.INTERNAL_PERSISTENCE_KEY;
  } else {
    process.env.INTERNAL_PERSISTENCE_KEY = originalInternalPersistenceKey;
  }
});

describe("valuation history detail route", () => {
  test("rejects unsigned replay reads", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";

    const response = await GET(
      new Request("http://localhost/api/dcf/history/run-123", {
        headers: { "x-vercel-forwarded-for": "203.0.113.89" },
      }),
      { params: Promise.resolve({ runId: "run-123" }) },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("returns bad request for missing run id", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    const headers = createInternalPersistenceHeaders({
      secret: "secret",
      method: "GET",
      url: "http://localhost/api/dcf/history/",
      body: "",
      nonce: "history-detail-missing",
      timestampMs: Date.now(),
    });
    const response = await GET(
      new Request("http://localhost/api/dcf/history/", {
        headers: {
          ...headers,
          "x-vercel-forwarded-for": "203.0.113.90",
        },
      }),
      { params: Promise.resolve({ runId: "" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "BAD_REQUEST" });
  });

  test("passes syncToken and includeTrace to Convex", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    let capturedName: string | undefined;
    let capturedArgs: Record<string, unknown> | undefined;
    ConvexHttpClient.prototype.query = async (name, args) => {
      capturedName = String(name);
      capturedArgs = args as Record<string, unknown>;
      return null;
    };

    const url = "http://localhost/api/dcf/history/run-123";
    const headers = createInternalPersistenceHeaders({
      secret: "secret",
      method: "GET",
      url,
      body: "",
      nonce: "history-detail-query",
      timestampMs: Date.now(),
    });
    await GET(
      new Request(url, {
        headers: {
          ...headers,
          "x-vercel-forwarded-for": "203.0.113.91",
        },
      }),
      { params: Promise.resolve({ runId: "run-123" }) },
    );

    expect(capturedName).toBe("valuations:get");
    expect(capturedArgs).toEqual({
      syncToken: "sync-token",
      runId: "run-123",
      includeTrace: true,
    });
  });

  test("returns normalized replay payload from inline trace", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    ConvexHttpClient.prototype.query = async () => ({
      run: {
        _id: "run-123",
        createdAt: 1700000000000,
        symbol: "AAPL",
        status: "success",
        inputs: { scenario: "bull" },
        traceStorage: "inline",
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
          monteCarlo: {
            histogram: { binCenters: [120, 130], density: [0.4, 1] },
            summary: { p10: 118.1, p90: 171.4 },
          },
          sensitivity: {
            growthOffsets: [-2, -1, 0, 1, 2],
            waccOffsets: [-0.02, -0.01, 0, 0.01, 0.02],
            values: [[140, 145, 150]],
          },
        },
      },
    });

    const url = "http://localhost/api/dcf/history/run-123";
    const headers = createInternalPersistenceHeaders({
      secret: "secret",
      method: "GET",
      url,
      body: "",
      nonce: "history-detail-inline",
      timestampMs: Date.now(),
    });
    const response = await GET(
      new Request(url, {
        headers: {
          ...headers,
          "x-vercel-forwarded-for": "203.0.113.92",
        },
      }),
      { params: Promise.resolve({ runId: "run-123" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      replay: {
        runId: "run-123",
        ticker: "AAPL",
        createdAt: 1700000000000,
        scenarios: {
          base: { fairValue: 145.12 },
          bull: { fairValue: 182.3 },
          bear: { fairValue: 109.8 },
        },
        range: [118.1, 171.4],
        histogram: { binCenters: [120, 130], density: [0.4, 1] },
        sensitivity: {
          growthOffsets: [-2, -1, 0, 1, 2],
          waccOffsets: [-2, -1, 0, 1, 2],
        },
        projections: [
          {
            year: 2025,
            revenue: 130,
            ebit: 32,
            nopat: 26,
            freeCashFlow: 21,
          },
        ],
      },
    });
  });

  test("returns not found when Convex has no matching run", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    ConvexHttpClient.prototype.query = async () => null;

    const url = "http://localhost/api/dcf/history/run-404";
    const headers = createInternalPersistenceHeaders({
      secret: "secret",
      method: "GET",
      url,
      body: "",
      nonce: "history-detail-not-found",
      timestampMs: Date.now(),
    });
    const response = await GET(
      new Request(url, {
        headers: {
          ...headers,
          "x-vercel-forwarded-for": "203.0.113.93",
        },
      }),
      { params: Promise.resolve({ runId: "run-404" }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  test("returns conflict when run has no replayable trace", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    ConvexHttpClient.prototype.query = async () => ({
      run: {
        _id: "run-error",
        createdAt: 1700000001000,
        symbol: "AAPL",
        status: "error",
        traceStorage: "none",
      },
    });

    const url = "http://localhost/api/dcf/history/run-error";
    const headers = createInternalPersistenceHeaders({
      secret: "secret",
      method: "GET",
      url,
      body: "",
      nonce: "history-detail-conflict",
      timestampMs: Date.now(),
    });
    const response = await GET(
      new Request(url, {
        headers: {
          ...headers,
          "x-vercel-forwarded-for": "203.0.113.94",
        },
      }),
      { params: Promise.resolve({ runId: "run-error" }) },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "CONFLICT" });
  });
});
