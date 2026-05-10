import type { Assumptions, Scenario } from '@/lib/workbench/scenarioProfiles';

export interface ValuationScenarioSummary {
  fairValuePerShare?: number;
  fair_value_per_share?: number;
}

export interface ValuationMonteCarloSummary {
  p10?: number;
  p90?: number;
  runs?: number;
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  p25?: number;
  p75?: number;
}

export interface ValuationHistogram {
  binCenters: number[];
  density: number[];
}

export interface ValuationRun {
  _id: string;
  _creationTime: number;
  createdAt: number;
  engineVersion: string;
  status: 'success' | 'error';
  error?: string;
  requestId?: string;
  symbol?: string;
  inputs: unknown;
  normalizedInputs?: unknown;
  provenance?: unknown;
  resultSummary?: {
    base?: ValuationScenarioSummary;
    bull?: ValuationScenarioSummary;
    bear?: ValuationScenarioSummary;
    monteCarlo?: {
      histogram?: ValuationHistogram;
      summary?: ValuationMonteCarloSummary;
    };
  };
  primaryKeyNorm?: string;
  regionCode?: string;
  asOfDate?: string;
  traceStorage: 'none' | 'inline' | 'external';
  trace?: unknown;
}

export interface ValuationHistoryItem {
  id: string;
  ticker: string;
  timestamp: Date;
  value: number;
}

export interface ValuationReplaySnapshot {
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
}

type ValuationHistoryLookup = {
  symbol?: string;
  primaryKeyNorm?: string;
  regionCode?: string;
  limit?: number;
};

type ValuationHistoryPathOptions = {
  browserReads?: boolean;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;

const asNumberArray = (value: unknown): number[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'number')
    ? value
    : [];

const asPercentOffsets = (value: unknown): number[] => {
  const offsets = asNumberArray(value);
  const scale = offsets.some((offset) => Math.abs(offset) > 1) ? 1 : 100;
  return offsets.map((offset) => Math.round(offset * scale * 100) / 100);
};

const asNumberMatrix = (value: unknown): number[][] | undefined =>
  Array.isArray(value) &&
  value.every((row) => Array.isArray(row) && row.every((item) => typeof item === 'number'))
    ? value as number[][]
    : undefined;

const readScenario = (value: unknown): Scenario => {
  const scenario = asString(asRecord(value)?.scenario);
  return scenario === 'bull' || scenario === 'bear' ? scenario : 'base';
};

const toDisplayPercent = (value: number): number =>
  Math.round((Math.abs(value) <= 1 ? value * 100 : value) * 100) / 100;

const readAssumptionsForScenario = (value: unknown, scenario: Scenario): Assumptions | null => {
  const inputs = asRecord(value);
  const candidate = asRecord(inputs?.[scenario]);
  if (!candidate) {
    return null;
  }
  const revenueGrowth = asNumber(candidate.revenueGrowth) ?? asNumber(candidate.revenue_growth);
  const operatingMargin = asNumber(candidate.ebitMargin) ?? asNumber(candidate.ebit_margin);
  const discountRate = asNumber(candidate.wacc);
  const terminalGrowth = asNumber(candidate.gStable) ?? asNumber(candidate.g_stable);
  if (
    revenueGrowth === null ||
    operatingMargin === null ||
    discountRate === null ||
    terminalGrowth === null
  ) {
    return null;
  }
  return {
    revenueGrowth: toDisplayPercent(revenueGrowth),
    operatingMargin: toDisplayPercent(operatingMargin),
    discountRate: toDisplayPercent(discountRate),
    terminalGrowth: toDisplayPercent(terminalGrowth),
  };
};

const readReplayAssumptions = (value: unknown): Partial<Record<Scenario, Assumptions>> | undefined => {
  const assumptions: Partial<Record<Scenario, Assumptions>> = {};
  for (const scenario of ['base', 'bull', 'bear'] as const) {
    const scenarioAssumptions = readAssumptionsForScenario(value, scenario);
    if (scenarioAssumptions) {
      assumptions[scenario] = scenarioAssumptions;
    }
  }
  return Object.keys(assumptions).length ? assumptions : undefined;
};

const readProjections = (scenarioResult: unknown): ValuationReplaySnapshot['projections'] => {
  const trace = asRecord(asRecord(scenarioResult)?.trace);
  const forecast = asRecord(trace?.forecast);
  if (!forecast) {
    return [];
  }
  const years = asNumberArray(forecast.years);
  const revenue = asNumberArray(forecast.revenue);
  const ebit = asNumberArray(forecast.ebit);
  const nopat = asNumberArray(forecast.nopat);
  const fcff = asNumberArray(forecast.fcff);
  return years.map((year, index) => ({
    year,
    revenue: asNumber(revenue[index]),
    ebit: asNumber(ebit[index]),
    nopat: asNumber(nopat[index]),
    freeCashFlow: asNumber(fcff[index]),
  }));
};

const readKpis = (value: unknown): ValuationReplaySnapshot['kpis'] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const record = asRecord(item);
    const key = asString(record?.key);
    const label = asString(record?.label);
    if (!record || !key || !label) {
      return [];
    }
    return [{
      key,
      label,
      value: asNumber(record.value),
      score: asNumber(record.score),
      direction: record.direction === 'lower' ? 'lower' as const : 'higher' as const,
      unit: asString(record.unit),
    }];
  });
};

const readStatementHistory = (value: unknown): ValuationReplaySnapshot['statementHistory'] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const record = asRecord(item);
    const periodEnd = asString(record?.periodEnd);
    if (!record || !periodEnd) {
      return [];
    }
    return [{
      periodEnd,
      revenue: asNumber(record.revenue),
      operatingIncome: asNumber(record.operatingIncome),
      operatingMargin: asNumber(record.operatingMargin),
      cash: asNumber(record.cash),
      debt: asNumber(record.debt),
      sharesOutstanding: asNumber(record.sharesOutstanding),
    }];
  });
};

const readMonteCarloSummary = (
  monteCarlo: Record<string, unknown> | null,
): ValuationReplaySnapshot['monteCarloSummary'] => {
  const summary = asRecord(monteCarlo?.summary);
  const runs = asNumber(monteCarlo?.runs);
  const min = asNumber(summary?.min);
  const max = asNumber(summary?.max);
  const mean = asNumber(summary?.mean);
  const median = asNumber(summary?.median);
  const p10 = asNumber(summary?.p10);
  const p25 = asNumber(summary?.p25);
  const p75 = asNumber(summary?.p75);
  const p90 = asNumber(summary?.p90);
  if (
    runs === null ||
    min === null ||
    max === null ||
    mean === null ||
    median === null ||
    p10 === null ||
    p25 === null ||
    p75 === null ||
    p90 === null
  ) {
    return undefined;
  }
  return { runs, min, max, mean, median, p10, p25, p75, p90 };
};

export function readFairValue(candidate: unknown): number | null {
  const record = asRecord(candidate);
  if (!record) {
    return null;
  }
  return (
    asNumber(record.fairValuePerShare) ??
    asNumber(record.fair_value_per_share) ??
    asNumber(record.fairValue)
  );
}

export function buildValuationHistoryPath({
  symbol,
  primaryKeyNorm,
  regionCode,
  limit = 10,
}: ValuationHistoryLookup, options: ValuationHistoryPathOptions = {}): string | null {
  const trimmedSymbol = symbol?.trim();
  const trimmedPrimaryKeyNorm = primaryKeyNorm?.trim();
  if (Boolean(trimmedSymbol) === Boolean(trimmedPrimaryKeyNorm)) {
    return null;
  }

  const searchParams = new URLSearchParams();

  if (trimmedSymbol) {
    searchParams.set('symbol', trimmedSymbol);
  } else if (trimmedPrimaryKeyNorm) {
    searchParams.set('primaryKeyNorm', trimmedPrimaryKeyNorm);
    if (regionCode?.trim()) {
      searchParams.set('regionCode', regionCode.trim());
    }
  }
  searchParams.set('limit', String(limit));

  const basePath = options.browserReads ? '/api/dcf/history/browser' : '/api/dcf/history';
  return `${basePath}?${searchParams.toString()}`;
}

export function buildValuationRunDetailPath(
  runId: string | undefined,
  options: ValuationHistoryPathOptions = {},
): string | null {
  const trimmedRunId = runId?.trim();
  if (!trimmedRunId) {
    return null;
  }
  const basePath = options.browserReads ? '/api/dcf/history/browser' : '/api/dcf/history';
  return `${basePath}/${encodeURIComponent(trimmedRunId)}`;
}

export function mapValuationRunsToHistoryItems(runs: ValuationRun[]): ValuationHistoryItem[] {
  return runs.flatMap((run) => {
    if (run.status !== 'success') {
      return [];
    }
    const baseValue = readFairValue(run.resultSummary?.base);
    if (baseValue === null) {
      return [];
    }
    return [{
      id: run._id,
      ticker: run.symbol ?? 'N/A',
      timestamp: new Date(run.createdAt),
      value: baseValue,
    }];
  });
}

export function normalizeValuationReplay(value: unknown): ValuationReplaySnapshot | null {
  const payload = asRecord(value);
  const run = asRecord(payload?.run);
  if (!run) {
    return null;
  }

  const runId = typeof run._id === 'string' ? run._id : null;
  const createdAt = asNumber(run.createdAt);
  if (!runId || createdAt === null) {
    return null;
  }

  const inlineTrace = asRecord(run.trace);
  const externalTraceWrapper = asRecord(payload?.trace);
  const trace =
    inlineTrace ??
    asRecord(externalTraceWrapper?.trace) ??
    externalTraceWrapper;
  if (!trace) {
    return null;
  }

  const baseValue = readFairValue(asRecord(asRecord(trace.base)?.valuation));
  const bullValue = readFairValue(asRecord(asRecord(trace.bull)?.valuation));
  const bearValue = readFairValue(asRecord(asRecord(trace.bear)?.valuation));
  if (baseValue === null || bullValue === null || bearValue === null) {
    return null;
  }

  const monteCarlo = asRecord(trace.monteCarlo);
  const histogram = asRecord(monteCarlo?.histogram);
  const summary = asRecord(monteCarlo?.summary);
  const p10 = asNumber(summary?.p10);
  const p90 = asNumber(summary?.p90);

  const binCenters = histogram?.binCenters;
  const density = histogram?.density;
  const normalizedHistogram =
    Array.isArray(binCenters) &&
    Array.isArray(density) &&
    binCenters.every((item) => typeof item === 'number') &&
    density.every((item) => typeof item === 'number')
      ? {
          binCenters: binCenters as number[],
          density: density as number[],
        }
      : undefined;
  const sensitivity = asRecord(trace.sensitivity);
  const kpiWrapper = asRecord(trace.kpis);
  const provenance = asRecord(run.provenance);
  const replayScenario = readScenario(run.inputs);
  const replayAssumptions = readReplayAssumptions(run.inputs);
  const scenarioTrace = trace[replayScenario] ?? trace.base;

  return {
    runId,
    ticker: typeof run.symbol === 'string' ? run.symbol : undefined,
    createdAt,
    scenario: replayScenario,
    assumptions: replayAssumptions,
    scenarios: {
      base: { fairValue: baseValue },
      bull: { fairValue: bullValue },
      bear: { fairValue: bearValue },
    },
    range: p10 !== null && p90 !== null ? [p10, p90] : undefined,
    histogram: normalizedHistogram,
    sensitivityMatrix: asNumberMatrix(sensitivity?.values),
    sensitivity: sensitivity
      ? {
          growthOffsets: asPercentOffsets(sensitivity.growthOffsets),
          waccOffsets: asPercentOffsets(sensitivity.waccOffsets),
        }
      : undefined,
    projections: readProjections(scenarioTrace),
    kpis: readKpis(kpiWrapper?.kpis),
    statementHistory: readStatementHistory(kpiWrapper?.history),
    monteCarloSummary: readMonteCarloSummary(monteCarlo),
    provenance: {
      symbol: typeof run.symbol === 'string' ? run.symbol : '',
      name: asString(provenance?.name),
      cik: asString(provenance?.cik),
      currency: asString(provenance?.currency),
      source: asString(provenance?.source) ?? asString(provenance?.sourceSystem),
      latestPeriodEnd: asString(provenance?.latestPeriodEnd),
      latestFilingDate: asString(provenance?.latestFilingDate),
      latestStatementSource: asString(provenance?.latestStatementSource),
    },
  };
}
