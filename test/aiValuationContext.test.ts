/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";

import {
  buildAiValuationContext,
  type AiValuationContext,
} from "../lib/hooks/useDashboardController";
import type { CompanySearchResult } from "../lib/contracts/company";
import type { DcfResult } from "../lib/hooks/useDcfCompute";

const company: CompanySearchResult = {
  id: "sec:0000320193:AAPL",
  symbol: "AAPL",
  name: "Apple Inc.",
  exchangeMic: "XNAS",
  market: "NASDAQ",
  country: "US",
  currency: "USD",
  coverageState: "valuation_ready",
  coverageReason: "SEC annual facts are valuation ready",
  sourceLinks: [{ title: "SEC submissions", url: "https://data.sec.gov/submissions/CIK0000320193.json" }],
};

const result: DcfResult = {
  fairValue: 210,
  range: [180, 245],
  histogram: {
    binCenters: [175, 200, 225],
    density: [0.2, 0.6, 0.2],
  },
  scenarios: {
    base: 210,
    bull: 260,
    bear: 155,
  },
  sensitivityMatrix: [
    [190, 205],
    [215, 230],
  ],
  sensitivity: {
    growthOffsets: [-1, 0],
    waccOffsets: [0, 1],
  },
  projections: [
    { year: 2026, revenue: 420_000, ebit: 130_000, nopat: 105_000, freeCashFlow: 98_000 },
  ],
  kpis: [
    { key: "margin", label: "Operating Margin", value: 31, score: 0.8, direction: "higher", unit: "%" },
  ],
  statementHistory: [
    {
      periodEnd: "2025-09-30",
      revenue: 395_000,
      operatingIncome: 125_000,
      operatingMargin: 0.3165,
      cash: 65_000,
      debt: 95_000,
      sharesOutstanding: 15_000,
    },
  ],
  monteCarloSummary: {
    runs: 2_000,
    min: 140,
    max: 280,
    mean: 211,
    median: 209,
    p10: 180,
    p25: 195,
    p75: 230,
    p90: 245,
  },
  provenance: {
    symbol: "AAPL",
    name: "Apple Inc.",
    cik: "0000320193",
    currency: "USD",
    source: "SEC EDGAR",
    latestPeriodEnd: "2025-09-30",
    latestFilingDate: "2025-10-31",
    latestStatementSource: "10-K",
  },
};

const assumptions: AiValuationContext["currentAssumptions"] = {
  base: { revenueGrowth: 5, operatingMargin: 30, discountRate: 9, terminalGrowth: 2.5 },
  bull: { revenueGrowth: 8, operatingMargin: 33, discountRate: 8, terminalGrowth: 3 },
  bear: { revenueGrowth: 1, operatingMargin: 26, discountRate: 10.5, terminalGrowth: 1.5 },
};

describe("buildAiValuationContext", () => {
  test("includes the analyst-relevant valuation context for scenario assumptions", () => {
    const context = buildAiValuationContext({
      activeCompanyId: company.id,
      activeTicker: "AAPL",
      companyDetail: {
        ...company,
        sourceLinks: [{ title: "Companyfacts", url: "https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json" }],
      },
      convexImportContext: {
        importedFacts: {
          listingId: company.id,
          symbol: "AAPL",
          approvedAt: 1_700_000_000_000,
          facts: { statements: [{ periodEnd: "2025-09-30", revenue: 395_000 }] },
          provenance: { sourceSystem: "convex-import" },
        },
        artifacts: [
          {
            artifactId: "artifact-1",
            status: "approved",
            originalFilename: "apple-10k.xlsx",
            storageId: "storage-1",
          },
        ],
      },
      displayCurrency: "USD",
      historyReadsEnabled: true,
      result,
      scenario: "base",
      scenarioAssumptions: assumptions,
      selectedSearchCompany: company,
    });

    expect(context.task).toBe("dcf_scenario_assumptions");
    expect(context.company).toMatchObject({
      id: company.id,
      symbol: "AAPL",
      name: "Apple Inc.",
      exchangeMic: "XNAS",
      market: "NASDAQ",
      country: "US",
      currency: "USD",
      coverageState: "valuation_ready",
    });
    expect(context.company.sourceLinks).toHaveLength(2);
    expect(context.currentAssumptions).toEqual(assumptions);
    expect(context.instructions.useContext).toContain(
      "current base, bull, and bear assumptions only as dashboard state for no-op avoidance",
    );
    expect(context.valuation).toEqual({
      activeFairValue: 210,
      range: [180, 245],
      scenarios: { base: 210, bull: 260, bear: 155 },
    });
    expect(context.financials.kpis).toEqual(result.kpis);
    expect(context.financials.statementHistory).toEqual(result.statementHistory);
    expect(context.financials.statementTrends).toMatchObject({
      latestPeriodEnd: "2025-09-30",
      latestOperatingMarginPct: 31.65,
      averageOperatingMarginPct: 31.65,
      latestCashToRevenuePct: 16.46,
      latestDebtToRevenuePct: 24.05,
      latestNetDebtToRevenuePct: 7.59,
      periodsCovered: ["2025-09-30"],
    });
    expect(context.financials.projections).toEqual(result.projections);
    expect(context.sensitivity).toEqual({
      growthOffsets: [-1, 0],
      waccOffsets: [0, 1],
      values: result.sensitivityMatrix,
    });
    expect(context.monteCarlo).toEqual({
      summary: result.monteCarloSummary,
      histogram: result.histogram,
    });
    expect(context.provenance).toEqual(result.provenance);
    expect(context.convex).toEqual({
      importedFacts: {
        listingId: company.id,
        symbol: "AAPL",
        approvedAt: 1_700_000_000_000,
        facts: { statements: [{ periodEnd: "2025-09-30", revenue: 395_000 }] },
        provenance: { sourceSystem: "convex-import" },
      },
      importArtifacts: [
        {
          artifactId: "artifact-1",
          status: "approved",
          originalFilename: "apple-10k.xlsx",
          storageId: "storage-1",
        },
      ],
      historyReadsEnabled: true,
    });
    expect(context.instructions.useContext).toContain("historical statement facts and KPI trends");
    expect(context.instructions.useContext).toContain("approved Convex imported facts and artifacts when present");
  });
});
