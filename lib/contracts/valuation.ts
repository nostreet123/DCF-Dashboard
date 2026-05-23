import type { Assumptions, Scenario } from '@/lib/workbench/scenarioProfiles';

export type ValuationScenarioSummary = {
  fairValuePerShare?: number;
  fair_value_per_share?: number;
  fairValue?: number;
};

export type ValuationHistogram = {
  binCenters: number[];
  density: number[];
};

export type ValuationMonteCarloSummary = {
  p10?: number;
  p90?: number;
  runs?: number;
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  p25?: number;
  p75?: number;
};

export type DcfScenarioResult = {
  valuation?: ValuationScenarioSummary;
  trace?: unknown;
};

export type DcfResult = {
  base?: DcfScenarioResult;
  bull?: DcfScenarioResult;
  bear?: DcfScenarioResult;
  kpis?: unknown[];
  monteCarlo?: {
    histogram?: ValuationHistogram;
    summary?: ValuationMonteCarloSummary;
    runs?: number;
  };
  provenance?: Record<string, unknown>;
};

export type ValuationReplaySnapshot = {
  runId: string;
  ticker?: string;
  createdAt: number;
  scenario?: Scenario;
  assumptions?: Partial<Record<Scenario, Assumptions>>;
  scenarios: {
    base: { fairValue: number };
    bull: { fairValue: number };
    bear: { fairValue: number };
  };
  range?: [number, number];
  histogram?: ValuationHistogram;
  sensitivityMatrix?: number[][];
  sensitivity?: {
    growthOffsets: number[];
    waccOffsets: number[];
  };
  projections: Array<{
    year: number;
    revenue: number | null;
    ebit: number | null;
    nopat: number | null;
    freeCashFlow: number | null;
  }>;
  kpis: Array<{
    key: string;
    label: string;
    value: number | null;
    score: number | null;
    direction: 'higher' | 'lower';
    unit?: string | null;
  }>;
  statementHistory: Array<{
    periodEnd: string;
    revenue?: number | null;
    operatingIncome?: number | null;
    operatingMargin?: number | null;
    cash?: number | null;
    debt?: number | null;
    sharesOutstanding?: number | null;
  }>;
  monteCarloSummary?: Required<ValuationMonteCarloSummary>;
  provenance?: {
    symbol: string;
    name?: string | null;
    cik?: string | null;
    currency?: string | null;
    source?: string | null;
    latestPeriodEnd?: string | null;
    latestFilingDate?: string | null;
    latestStatementSource?: string | null;
  };
};
