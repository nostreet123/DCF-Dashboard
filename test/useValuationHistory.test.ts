/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";

import {
  buildValuationHistoryPath,
  buildValuationRunDetailPath,
  mapValuationRunsToHistoryItems,
  normalizeValuationReplay,
  toUserFacingValuationHistoryError,
} from "../lib/hooks/useValuationHistory";

describe("valuation history hook helpers", () => {
  test("builds ticker history path", () => {
    expect(buildValuationHistoryPath({ symbol: "AAPL", limit: 5 })).toBe(
      "/api/dcf/history?symbol=AAPL&limit=5",
    );
  });

  test("builds browser-readable ticker history path when requested", () => {
    expect(
      buildValuationHistoryPath(
        { symbol: "AAPL", limit: 5 },
        { browserReads: true },
      ),
    ).toBe("/api/dcf/history/browser?symbol=AAPL&limit=5");
  });

  test("builds primary key history path with region", () => {
    expect(
      buildValuationHistoryPath({
        primaryKeyNorm: "brk.b",
        regionCode: "US",
        limit: 7,
      }),
    ).toBe("/api/dcf/history?primaryKeyNorm=brk.b&regionCode=US&limit=7");
  });

  test("returns null when no lookup key is provided", () => {
    expect(buildValuationHistoryPath({ limit: 10 })).toBeNull();
  });

  test("builds run detail path", () => {
    expect(buildValuationRunDetailPath("run-123")).toBe("/api/dcf/history/run-123");
    expect(
      buildValuationRunDetailPath("run-123", { browserReads: true }),
    ).toBe("/api/dcf/history/browser/run-123");
    expect(buildValuationRunDetailPath("   ")).toBeNull();
  });

  test("maps successful runs with base fair value into history items", () => {
    expect(
      mapValuationRunsToHistoryItems([
        {
          _id: "run-1",
          createdAt: 1700000000000,
          status: "success",
          symbol: "AAPL",
          traceStorage: "inline",
          inputs: {},
          engineVersion: "workbench-v1",
          _creationTime: 1700000000001,
          resultSummary: {
            base: { fairValuePerShare: 145.25 },
          },
        },
        {
          _id: "run-2",
          createdAt: 1700000001000,
          status: "error",
          symbol: "AAPL",
          traceStorage: "none",
          inputs: {},
          engineVersion: "workbench-v1",
          _creationTime: 1700000001001,
        },
      ]),
    ).toEqual([
      {
        id: "run-1",
        ticker: "AAPL",
        timestamp: new Date(1700000000000),
        value: 145.25,
      },
    ]);
  });

  test("normalizes replay payload and derives optional Monte Carlo range", () => {
    const replay = normalizeValuationReplay({
        run: {
          _id: "run-3",
          createdAt: 1700000002000,
          symbol: "MSFT",
          inputs: { scenario: "bull" },
          provenance: { sourceSystem: "User-reviewed import" },
          traceStorage: "inline",
          trace: {
            base: { valuation: { fairValuePerShare: 301.5 } },
            bull: { valuation: { fairValuePerShare: 360.2 } },
            bear: { valuation: { fairValuePerShare: 250.1 } },
            monteCarlo: {
              histogram: { binCenters: [280, 320], density: [0.5, 1] },
              summary: { p10: 270, p90: 345 },
            },
          },
        },
      });

    expect(replay).toMatchObject({
      runId: "run-3",
      ticker: "MSFT",
      createdAt: 1700000002000,
      scenario: "bull",
      scenarios: {
        base: { fairValue: 301.5 },
        bull: { fairValue: 360.2 },
        bear: { fairValue: 250.1 },
      },
      range: [270, 345],
      histogram: { binCenters: [280, 320], density: [0.5, 1] },
    });
    expect(replay?.projections).toEqual([]);
    expect(replay?.kpis).toEqual([]);
    expect(replay?.statementHistory).toEqual([]);
    expect(replay?.provenance?.source).toBe("User-reviewed import");
  });

  test("maps raw 429 identity failures to friendly history copy", () => {
    expect(
      toUserFacingValuationHistoryError({
        status: 429,
        message: "Request origin could not be verified",
      }).message,
    ).toBe("Recent runs are temporarily unavailable. Try again in a moment.");
  });

  test("maps unauthorized history reads to a non-technical unavailable message", () => {
    expect(
      toUserFacingValuationHistoryError({
        status: 401,
        message: "Unauthorized",
      }).message,
    ).toBe("Recent runs are unavailable in this environment.");
  });

  test("keeps a generic fallback for unexpected history failures", () => {
    expect(
      toUserFacingValuationHistoryError({
        status: 502,
        message: "Valuation history fetch failed",
      }).message,
    ).toBe("Unable to load recent runs.");
  });
});
