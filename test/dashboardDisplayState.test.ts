/// <reference types="bun-types" />
import { afterEach, describe, expect, test } from "bun:test";

import {
  areBrowserHistoryReadsEnabled,
  getDashboardDataMode,
} from "../lib/dashboardDataMode";
import { resolveDisplayedValuationData } from "../lib/hooks/useDashboardController";

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

  test("defaults dashboard data mode to demo", () => {
    delete process.env.NEXT_PUBLIC_DCF_DASHBOARD_MODE;
    expect(getDashboardDataMode()).toBe("demo");
  });

  test("enables live dashboard data mode explicitly", () => {
    process.env.NEXT_PUBLIC_DCF_DASHBOARD_MODE = "live";
    expect(getDashboardDataMode()).toBe("live");
  });

  test("requires an explicit public flag for browser history reads", () => {
    delete process.env.NEXT_PUBLIC_VALUATION_HISTORY_BROWSER_READS;
    expect(areBrowserHistoryReadsEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_VALUATION_HISTORY_BROWSER_READS = "1";
    expect(areBrowserHistoryReadsEnabled()).toBe(true);
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
        },
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
        },
      }),
    ).toEqual({
      currentValue: 182,
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
        },
      }),
    ).toMatchObject({ currentValue: 182 });
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
        },
      }),
    ).toEqual({
      currentValue: 130,
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
        },
        replaySnapshot: null,
      }),
    ).toEqual({
      currentValue: 151,
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
      valuationRange: undefined,
      histogram: undefined,
    });
  });
});
