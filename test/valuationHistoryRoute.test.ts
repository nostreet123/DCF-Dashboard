/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ConvexHttpClient } from "convex/browser";

import { GET } from "../app/api/dcf/history/route";
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

describe("valuation history route", () => {
  test("rejects unsigned history reads", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";

    const response = await GET(
      new Request("http://localhost/api/dcf/history?symbol=AAPL", {
        headers: { "x-vercel-forwarded-for": "203.0.113.69" },
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("returns bad request when no lookup key is provided", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    const headers = createInternalPersistenceHeaders({
      secret: "secret",
      method: "GET",
      url: "http://localhost/api/dcf/history",
      body: "",
      nonce: "history-no-lookup",
      timestampMs: Date.now(),
    });
    const response = await GET(
      new Request("http://localhost/api/dcf/history", {
        headers: {
          ...headers,
          "x-vercel-forwarded-for": "203.0.113.70",
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  test("returns bad request when symbol and primary key are both provided", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    const url = "http://localhost/api/dcf/history?symbol=AAPL&primaryKeyNorm=aapl";
    const headers = createInternalPersistenceHeaders({
      secret: "secret",
      method: "GET",
      url,
      body: "",
      nonce: "history-both-lookup",
      timestampMs: Date.now(),
    });
    const response = await GET(
      new Request(url, {
        headers: {
          ...headers,
          "x-vercel-forwarded-for": "203.0.113.71",
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  test("queries ticker history through Convex with syncToken and limit", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    const runs = [{ _id: "run-1", symbol: "AAPL", status: "success" }];
    let capturedName: string | undefined;
    let capturedArgs: Record<string, unknown> | undefined;
    ConvexHttpClient.prototype.query = async (name, args) => {
      capturedName = String(name);
      capturedArgs = args as Record<string, unknown>;
      return runs;
    };

    const url = "http://localhost/api/dcf/history?symbol=AAPL&limit=5";
    const headers = createInternalPersistenceHeaders({
      secret: "secret",
      method: "GET",
      url,
      body: "",
      nonce: "history-ticker-query",
      timestampMs: Date.now(),
    });
    const response = await GET(
      new Request(url, {
        headers: {
          ...headers,
          "x-vercel-forwarded-for": "203.0.113.72",
        },
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

  test("queries primary key history through Convex with optional region", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    const runs = [{ _id: "run-2", primaryKeyNorm: "aapl", regionCode: "US" }];
    let capturedName: string | undefined;
    let capturedArgs: Record<string, unknown> | undefined;
    ConvexHttpClient.prototype.query = async (name, args) => {
      capturedName = String(name);
      capturedArgs = args as Record<string, unknown>;
      return runs;
    };

    const url =
      "http://localhost/api/dcf/history?primaryKeyNorm=aapl&regionCode=US&limit=7";
    const headers = createInternalPersistenceHeaders({
      secret: "secret",
      method: "GET",
      url,
      body: "",
      nonce: "history-primary-key-query",
      timestampMs: Date.now(),
    });
    const response = await GET(
      new Request(url, {
        headers: {
          ...headers,
          "x-vercel-forwarded-for": "203.0.113.73",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(capturedName).toBe("valuations:listBySymbol");
    expect(capturedArgs).toEqual({
      syncToken: "sync-token",
      primaryKeyNorm: "aapl",
      regionCode: "US",
      limit: 7,
    });
    expect(await response.json()).toEqual({ runs });
  });

  test("returns rate-limit unavailable when Convex backend is not configured", async () => {
    process.env.INTERNAL_PERSISTENCE_KEY = "secret";
    delete process.env.CONVEX_URL;

    const url = "http://localhost/api/dcf/history?symbol=AAPL";
    const headers = createInternalPersistenceHeaders({
      secret: "secret",
      method: "GET",
      url,
      body: "",
      nonce: "history-no-convex",
      timestampMs: Date.now(),
    });
    const response = await GET(
      new Request(url, {
        headers: {
          ...headers,
          "x-vercel-forwarded-for": "203.0.113.74",
        },
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "RATE_LIMIT_UNAVAILABLE",
    });
  });
});
