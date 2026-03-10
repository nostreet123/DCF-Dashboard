/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";

import { resolveDisplayedValuationData } from "../lib/hooks/useDashboardController";

describe("dashboard historical replay display state", () => {
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
        scenarioFallbacks: {
          base: 145.2,
          bull: 185.5,
          bear: 112.3,
        },
        fallbackRange: [100, 200],
        fallbackHistogram: { binCenters: [100], density: [1] },
      }),
    ).toEqual({
      currentValue: 182,
      valuationRange: [118, 171],
      histogram: { binCenters: [120, 130], density: [0.5, 1] },
    });
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
        scenarioFallbacks: {
          base: 145.2,
          bull: 185.5,
          bear: 112.3,
        },
        fallbackRange: [100, 200],
        fallbackHistogram: { binCenters: [100], density: [1] },
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
        scenarioFallbacks: {
          base: 145.2,
          bull: 185.5,
          bear: 112.3,
        },
        fallbackRange: [100, 200],
        fallbackHistogram: { binCenters: [100], density: [1] },
      }),
    ).toEqual({
      currentValue: 151,
      valuationRange: [140, 164],
      histogram: { binCenters: [150], density: [1] },
    });
  });
});
