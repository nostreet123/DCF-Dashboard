/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";

import {
  buildValuationHistoryPath,
  buildValuationRunDetailPath,
  getDemoHistoryItems,
  getDemoReplayForRun,
  isDemoHistoryRun,
  mapValuationRunsToHistoryItems,
  normalizeValuationReplay,
  toUserFacingValuationHistoryError,
} from "../lib/hooks/useValuationHistory";
import { mockRunHistory } from "../lib/workbench/mockData";

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
          inputs: {
            scenario: "bull",
            bull: {
              revenueGrowth: 0.22,
              ebitMargin: 0.31,
              wacc: 0.0875,
              gStable: 0.0325,
            },
          },
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
      assumptions: {
        bull: {
          revenueGrowth: 22,
          operatingMargin: 31,
          discountRate: 8.75,
          terminalGrowth: 3.25,
        },
      },
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

describe("demo mode helpers", () => {
  test("getDemoHistoryItems returns all mock run history entries", () => {
    const items = getDemoHistoryItems();
    expect(items).toHaveLength(mockRunHistory.length);
    expect(items.map((i) => i.id)).toEqual(mockRunHistory.map((r) => r.id));
    expect(items.map((i) => i.ticker)).toEqual(mockRunHistory.map((r) => r.ticker));
  });

  test("isDemoHistoryRun returns true for known mock run IDs", () => {
    for (const run of mockRunHistory) {
      expect(isDemoHistoryRun(run.id)).toBe(true);
    }
  });

  test("isDemoHistoryRun returns false for unknown run IDs", () => {
    expect(isDemoHistoryRun("unknown-run-id")).toBe(false);
    expect(isDemoHistoryRun("")).toBe(false);
  });

  test("getDemoReplayForRun returns a snapshot with the correct runId and ticker", () => {
    for (const run of mockRunHistory) {
      const snapshot = getDemoReplayForRun(run.id);
      expect(snapshot).not.toBeNull();
      expect(snapshot!.runId).toBe(run.id);
      expect(snapshot!.ticker).toBe(run.ticker);
      expect(snapshot!.provenance?.symbol).toBe(run.ticker);
    }
  });

  test("getDemoReplayForRun returns null for unknown run IDs", () => {
    expect(getDemoReplayForRun("not-a-real-run")).toBeNull();
  });

  test("getDemoReplayForRun snapshots for different runs have independent tickers", () => {
    const [first, second] = mockRunHistory;
    if (!first || !second) {
      return;
    }
    const snap1 = getDemoReplayForRun(first.id);
    const snap2 = getDemoReplayForRun(second.id);
    expect(snap1!.ticker).not.toBe(snap2!.ticker);
    expect(snap1!.ticker).toBe(first.ticker);
    expect(snap2!.ticker).toBe(second.ticker);
  });
});
