/// <reference types="bun-types" />
import { afterEach, describe, expect, test } from "bun:test";

import {
  areBrowserHistoryReadsEnabled,
  getDashboardDataMode,
} from "../lib/dashboardDataMode";
import {
  resolveDisplayedValuationData,
  shouldComputeLiveValuation,
} from "../lib/hooks/useDashboardController";
import type { DcfResult } from "../lib/hooks/useDcfCompute";
import type { ValuationReplaySnapshot } from "../lib/hooks/useValuationHistory";

describe("dashboard historical replay display state", () => {
  const originalDashboardMode = process.env.NEXT_PUBLIC_DCF_DASHBOARD_MODE;
  const originalBrowserReads = process.env.NEXT_PUBLIC_VALUATION_HISTORY_BROWSER_READS;

  afterEach(() => {
    if (originalDashboardMode === undefined) {
      delete process.env.NEXT_PUBLIC_DCF_DASHBOARD_MODE;
    } else {
      process.env.NEXT_PUBLIC_DCF_DASHBOARD_MODE = originalDashboardMode;
    }
    if (originalBrowserReads === undefined) {
      delete process.env.NEXT_PUBLIC_VALUATION_HISTORY_BROWSER_READS;
    } else {
      process.env.NEXT_PUBLIC_VALUATION_HISTORY_BROWSER_READS = originalBrowserReads;
    }
  });

  test("defaults dashboard data mode to live", () => {
    delete process.env.NEXT_PUBLIC_DCF_DASHBOARD_MODE;
    expect(getDashboardDataMode()).toBe("live");
  });

  test("enables demo dashboard data mode explicitly", () => {
    process.env.NEXT_PUBLIC_DCF_DASHBOARD_MODE = "demo";
    expect(getDashboardDataMode()).toBe("demo");
  });

  test("requires an explicit public flag for browser history reads", () => {
    delete process.env.NEXT_PUBLIC_VALUATION_HISTORY_BROWSER_READS;
    expect(areBrowserHistoryReadsEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_VALUATION_HISTORY_BROWSER_READS = "1";
    expect(areBrowserHistoryReadsEnabled()).toBe(true);
  });

  test("does not recompute live valuation while replaying a saved run", () => {
    expect(
      shouldComputeLiveValuation({
        isDemoMode: false,
        selectedRunId: "run-123",
        workspaceMode: "valuation",
      }),
    ).toBe(false);
    expect(
      shouldComputeLiveValuation({
        isDemoMode: false,
        selectedRunId: null,
        workspaceMode: "valuation",
      }),
    ).toBe(true);
  });

  test("uses replay snapshot for the active scenario", () => {
    expect(
      resolveDisplayedValuationData({
        scenario: "bull",
        liveResult: {
          fairValue: 150,
          range: [130, 170],
          histogram: { binCenters: [140], density: [1] },
          sensitivityMatrix: [],
        } as unknown as DcfResult,
        replaySnapshot: {
          runId: "run-1",
          createdAt: 1700000000000,
          scenarios: {
            base: { fairValue: 145 },
            bull: { fairValue: 182 },
            bear: { fairValue: 110 },
          },
          range: [118, 171],
          histogram: { binCenters: [120, 130], density: [0.5, 1] },
        } as ValuationReplaySnapshot,
      }),
    ).toEqual({
      currentValue: 182,
      displayScenario: "bull",
      valuationRange: [118, 171],
      histogram: { binCenters: [120, 130], density: [0.5, 1] },
    });
  });

  test("uses the saved replay scenario when it differs from the active tab", () => {
    expect(
      resolveDisplayedValuationData({
        scenario: "base",
        liveResult: null,
        replaySnapshot: {
          runId: "run-bull",
          createdAt: 1700000000000,
          scenario: "bull",
          scenarios: {
            base: { fairValue: 145 },
            bull: { fairValue: 182 },
            bear: { fairValue: 110 },
          },
        } as ValuationReplaySnapshot,
      }),
    ).toMatchObject({ currentValue: 182, displayScenario: "bull" });
  });

  test("does not fall back to mock range or histogram while replaying", () => {
    expect(
      resolveDisplayedValuationData({
        scenario: "base",
        liveResult: null,
        replaySnapshot: {
          runId: "run-2",
          createdAt: 1700000000001,
          scenarios: {
            base: { fairValue: 130 },
            bull: { fairValue: 150 },
            bear: { fairValue: 95 },
          },
          projections: [],
          kpis: [],
          statementHistory: [],
        } as ValuationReplaySnapshot,
      }),
    ).toEqual({
      currentValue: 130,
      displayScenario: "base",
      valuationRange: undefined,
      histogram: undefined,
    });
  });

  test("uses live result when no replay snapshot is selected", () => {
    expect(
      resolveDisplayedValuationData({
        scenario: "base",
        liveResult: {
          fairValue: 151,
          range: [140, 164],
          histogram: { binCenters: [150], density: [1] },
          sensitivityMatrix: [],
          scenarios: { base: 151, bull: 151, bear: 151 },
          projections: [],
          kpis: [],
          statementHistory: [],
          provenance: { symbol: "AAPL" },
        },
        replaySnapshot: null,
      }),
    ).toEqual({
      currentValue: 151,
      displayScenario: "base",
      valuationRange: [140, 164],
      histogram: { binCenters: [150], density: [1] },
    });
  });

  test("does not invent a display value when no compute result exists", () => {
    expect(
      resolveDisplayedValuationData({
        scenario: "base",
        liveResult: null,
        replaySnapshot: null,
      }),
    ).toEqual({
      currentValue: null,
      displayScenario: "base",
      valuationRange: undefined,
      histogram: undefined,
    });
  });
});
