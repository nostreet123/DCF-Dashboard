export interface ValuationScenarioSummary {
  fairValuePerShare?: number;
  fair_value_per_share?: number;
}

export interface ValuationMonteCarloSummary {
  p10?: number;
  p90?: number;
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
  scenarios: {
    base: { fairValue: number };
    bull: { fairValue: number };
    bear: { fairValue: number };
  };
  range?: [number, number];
  histogram?: ValuationHistogram;
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

  return {
    runId,
    ticker: typeof run.symbol === 'string' ? run.symbol : undefined,
    createdAt,
    scenarios: {
      base: { fairValue: baseValue },
      bull: { fairValue: bullValue },
      bear: { fairValue: bearValue },
    },
    range: p10 !== null && p90 !== null ? [p10, p90] : undefined,
    histogram: normalizedHistogram,
  };
}
