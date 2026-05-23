/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";

import {
  assumptionBounds,
  findUnsupportedRationaleTopics,
  isScenarioPayload,
  parseAnalysisPayload,
  shouldRetryForUnchangedAssumptions,
} from "../lib/ai/scenarioAnalysis/validation";
import { sampleOrderedAnalysis } from "./helpers/aiScenario";

describe("AI scenario validation", () => {
  test("isScenarioPayload accepts in-bounds assumptions with rationale", () => {
    expect(
      isScenarioPayload({
        revenueGrowth: 8,
        operatingMargin: 24,
        discountRate: 9,
        terminalGrowth: 2.5,
        rationale: "Grounded in filings.",
      }),
    ).toBe(true);
  });

  test("isScenarioPayload rejects out-of-bounds revenue growth", () => {
    expect(
      isScenarioPayload({
        revenueGrowth: assumptionBounds.revenueGrowth.max + 1,
        operatingMargin: 24,
        discountRate: 9,
        terminalGrowth: 2.5,
        rationale: "Too high.",
      }),
    ).toBe(false);
  });

  test("parseAnalysisPayload accepts ordered base bull bear output", () => {
    const analysis = sampleOrderedAnalysis();
    const parsed = parseAnalysisPayload(JSON.stringify(analysis));
    expect(parsed?.base.revenueGrowth).toBe(8);
    expect(parsed?.bear.rationale).toBe("Bear case.");
  });

  test("parseAnalysisPayload accepts wrapped analysis objects", () => {
    const parsed = parseAnalysisPayload(
      JSON.stringify({ analysis: sampleOrderedAnalysis() }),
    );
    expect(parsed?.bull.revenueGrowth).toBe(12);
  });

  test("parseAnalysisPayload rejects reversed bull/base ordering", () => {
    const analysis = sampleOrderedAnalysis();
    analysis.bull.revenueGrowth = 5;
    expect(parseAnalysisPayload(JSON.stringify(analysis))).toBeNull();
  });

  test("findUnsupportedRationaleTopics flags AI catalysts without evidence", () => {
    const analysis = sampleOrderedAnalysis();
    analysis.base.rationale = "Growth assumes an AI-driven catalyst.";
    const unsupported = findUnsupportedRationaleTopics(analysis, {
      company: { symbol: "AAPL" },
      financials: { statementTrends: { latestRevenueGrowthPct: 6.4 } },
    });
    expect(unsupported).toContain("AI catalysts");
  });

  test("findUnsupportedRationaleTopics allows topics present in evidence", () => {
    const analysis = sampleOrderedAnalysis();
    analysis.base.rationale = "Macro inflation remains a headwind.";
    const unsupported = findUnsupportedRationaleTopics(analysis, {
      company: { symbol: "AAPL" },
      notes: "Macro inflation pressure persists.",
    });
    expect(unsupported).not.toContain("macro conditions");
  });

  test("shouldRetryForUnchangedAssumptions detects no-op responses", () => {
    const currentAssumptions = {
      base: { revenueGrowth: 8, operatingMargin: 24, discountRate: 9, terminalGrowth: 2.5 },
      bull: { revenueGrowth: 12, operatingMargin: 28, discountRate: 8, terminalGrowth: 3 },
      bear: { revenueGrowth: 3, operatingMargin: 18, discountRate: 11, terminalGrowth: 1.5 },
    };
    expect(
      shouldRetryForUnchangedAssumptions(sampleOrderedAnalysis(), currentAssumptions, "base"),
    ).toBe(true);
  });

  test("shouldRetryForUnchangedAssumptions accepts materially changed active scenario", () => {
    const currentAssumptions = {
      base: { revenueGrowth: 12, operatingMargin: 25, discountRate: 10, terminalGrowth: 2.5 },
      bull: { revenueGrowth: 18, operatingMargin: 30, discountRate: 8, terminalGrowth: 3 },
      bear: { revenueGrowth: 6, operatingMargin: 18, discountRate: 14, terminalGrowth: 2 },
    };
    const analysis = sampleOrderedAnalysis();
    analysis.base.revenueGrowth = 9;
    expect(
      shouldRetryForUnchangedAssumptions(analysis, currentAssumptions, "base"),
    ).toBe(false);
  });
});
