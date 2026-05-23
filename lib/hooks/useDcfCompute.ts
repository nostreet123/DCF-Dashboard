'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Assumptions, Scenario } from '@/lib/workbench/scenarioProfiles';
import { readFairValue } from '@/lib/valuationHistory';
import {
  buildWorkbenchPayloadFromFacts,
  getLatestAnnualStatement,
} from '@/lib/workbench/factsPayload';

export interface DcfInputs {
  symbol: string;
  listingId?: string | null;
  scenario: Scenario;
  assumptions: Record<Scenario, Assumptions>;
}

export interface DcfResult {
  fairValue: number;
  range?: [number, number];
  histogram?: {
    binCenters: number[];
    density: number[];
  };
  scenarios: Record<Scenario, number | null>;
  sensitivityMatrix: number[][];
  sensitivity?: {
    growthOffsets: number[];
    waccOffsets: number[];
  };
  projections: ProjectionRow[];
  kpis: KpiValue[];
  statementHistory: StatementHistoryPoint[];
  monteCarloSummary?: MonteCarloSummary;
  provenance: ValuationProvenance;
}

export interface ProjectionRow {
  year: number;
  revenue: number | null;
  ebit: number | null;
  nopat: number | null;
  freeCashFlow: number | null;
}

export interface KpiValue {
  key: string;
  label: string;
  value: number | null;
  score: number | null;
  direction: 'higher' | 'lower';
  unit?: string | null;
}

export interface StatementHistoryPoint {
  periodEnd: string;
  revenue?: number | null;
  operatingIncome?: number | null;
  operatingMargin?: number | null;
  cash?: number | null;
  debt?: number | null;
  sharesOutstanding?: number | null;
}

export interface MonteCarloSummary {
  runs: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
}

export interface ValuationProvenance {
  symbol: string;
  name?: string | null;
  cik?: string | null;
  currency?: string | null;
  source?: string | null;
  latestPeriodEnd?: string | null;
  latestFilingDate?: string | null;
  latestStatementSource?: string | null;
}

interface UseDcfComputeOptions {
  debounceMs?: number;
}

import { readBrowserImportFactsToken } from '@/lib/browserImportTokens';

const SEC_LISTING_MIC_PREFIXES = new Set(['XNAS', 'XNYS', 'ARCX', 'XASE']);

const listingMicPrefix = (listingId: string | null | undefined): string | null => {
  const normalized = listingId?.trim().toUpperCase();
  if (!normalized) {
    return null;
  }
  const [micPrefix] = normalized.split(':', 1);
  return micPrefix && micPrefix !== normalized ? micPrefix : null;
};

const shouldUseBrowserFactsRead = (
  listingId: string | null | undefined,
  token: string | null,
): boolean => {
  if (!token) {
    return false;
  }
  const micPrefix = listingMicPrefix(listingId);
  return micPrefix !== null && !SEC_LISTING_MIC_PREFIXES.has(micPrefix);
};

// ---------------------------------------------------------------------------
// Core logic — framework-agnostic, testable without React
// ---------------------------------------------------------------------------

/** Mutable refs used by the compute engine. */
export interface ComputeRefs {
  abortController: AbortController | null;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  requestId: number;
  pendingReject: ((reason?: unknown) => void) | null;
}

/** Callbacks the engine uses to push state outward. */
export interface ComputeCallbacks {
  setIsLoading: (v: boolean) => void;
  setError: (v: Error | null) => void;
  setResult: (v: DcfResult | null) => void;
}

export function createComputeRefs(): ComputeRefs {
  return {
    abortController: null,
    debounceTimer: null,
    requestId: 0,
    pendingReject: null,
  };
}

type EdgarStatement = {
  period_end?: string | null;
  period_type?: string | null;
  filing_date?: string | null;
  currency?: string | null;
  revenue?: number | null;
  operating_income?: number | null;
  operating_margin?: number | null;
  cash?: number | null;
  debt?: number | null;
  shares_outstanding?: number | null;
  source?: string | null;
};

type EdgarFacts = {
  symbol: string;
  name?: string | null;
  cik?: string | null;
  currency?: string | null;
  source?: string | null;
  statements?: EdgarStatement[] | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readFiniteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const readString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;

const readErrorMessage = (payload: unknown): string | null => {
  if (!isRecord(payload)) {
    return null;
  }
  const candidate = payload.message ?? payload.detail ?? payload.error;
  return typeof candidate === 'string' ? candidate : null;
};

const DCF_FETCH_TIMEOUT_MS = 30_000;

const fetchJson = async <T>(url: string, init: RequestInit, label: string): Promise<T> => {
  const timeoutController = new AbortController();
  const parentSignal = init.signal;
  let didTimeout = false;
  const timeoutId = globalThis.setTimeout(() => {
    didTimeout = true;
    timeoutController.abort();
  }, DCF_FETCH_TIMEOUT_MS);
  const abortFromParent = () => timeoutController.abort();
  if (parentSignal?.aborted) {
    timeoutController.abort();
  }
  parentSignal?.addEventListener('abort', abortFromParent, { once: true });

  try {
    const response = await fetch(url, {
      ...init,
      signal: timeoutController.signal,
    });
    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      throw new Error(readErrorMessage(payload) ?? `${label} failed (${response.status})`);
    }
    if (payload === null) {
      throw new Error(`${label} returned an empty response`);
    }
    return payload as T;
  } catch (error) {
    if (didTimeout) {
      throw new Error(`${label} timed out after ${Math.round(DCF_FETCH_TIMEOUT_MS / 1000)} seconds`);
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
    parentSignal?.removeEventListener('abort', abortFromParent);
  }
};

export const buildWorkbenchPayload = buildWorkbenchPayloadFromFacts;

const readHistogram = (value: unknown): DcfResult['histogram'] => {
  const histogram = isRecord(value) ? value : null;
  const binCenters = histogram?.binCenters;
  const density = histogram?.density;
  if (binCenters === undefined && density === undefined) {
    return undefined;
  }
  if (
    Array.isArray(binCenters) &&
    Array.isArray(density) &&
    binCenters.every((item) => typeof item === 'number') &&
    density.every((item) => typeof item === 'number')
  ) {
    return { binCenters, density };
  }
  throw new Error('DCF compute response includes an invalid histogram');
};

const readNumberMatrix = (value: unknown): number[][] => {
  if (
    Array.isArray(value) &&
    value.every(
      (row) => Array.isArray(row) && row.every((item) => typeof item === 'number'),
    )
  ) {
    return value;
  }
  throw new Error('DCF compute response is missing sensitivity values');
};

const readNumberArray = (value: unknown): number[] => {
  if (Array.isArray(value) && value.every((item) => typeof item === 'number')) {
    return value;
  }
  return [];
};

const readPercentPointOffsets = (value: unknown): number[] => {
  const offsets = readNumberArray(value);
  const scale = offsets.some((offset) => Math.abs(offset) > 1) ? 1 : 100;
  return offsets.map((offset) => Math.round(offset * scale * 100) / 100);
};

const readScenarioValue = (payload: Record<string, unknown>, scenario: Scenario): number | null => {
  const scenarioResult = isRecord(payload[scenario]) ? payload[scenario] : null;
  const valuation = isRecord(scenarioResult?.valuation) ? scenarioResult.valuation : null;
  return readFairValue(valuation);
};

const readProjections = (scenarioResult: unknown): ProjectionRow[] => {
  const trace = isRecord(scenarioResult) && isRecord(scenarioResult.trace)
    ? scenarioResult.trace
    : null;
  const forecast = isRecord(trace?.forecast) ? trace.forecast : null;
  if (!forecast) {
    return [];
  }

  const years = readNumberArray(forecast.years);
  const revenue = readNumberArray(forecast.revenue);
  const ebit = readNumberArray(forecast.ebit);
  const nopat = readNumberArray(forecast.nopat);
  const fcff = readNumberArray(forecast.fcff);
  return years.map((year, index) => ({
    year,
    revenue: readFiniteNumber(revenue[index]),
    ebit: readFiniteNumber(ebit[index]),
    nopat: readFiniteNumber(nopat[index]),
    freeCashFlow: readFiniteNumber(fcff[index]),
  }));
};

const readKpis = (value: unknown): KpiValue[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const key = readString(item.key);
    const label = readString(item.label);
    const direction = item.direction === 'lower' ? 'lower' : 'higher';
    if (!key || !label) {
      return [];
    }
    return [{
      key,
      label,
      value: readFiniteNumber(item.value),
      score: readFiniteNumber(item.score),
      direction,
      unit: readString(item.unit),
    }];
  });
};

const readStatementHistory = (value: unknown): StatementHistoryPoint[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const periodEnd = readString(item.periodEnd);
    if (!periodEnd) {
      return [];
    }
    return [{
      periodEnd,
      revenue: readFiniteNumber(item.revenue),
      operatingIncome: readFiniteNumber(item.operatingIncome),
      operatingMargin: readFiniteNumber(item.operatingMargin),
      cash: readFiniteNumber(item.cash),
      debt: readFiniteNumber(item.debt),
      sharesOutstanding: readFiniteNumber(item.sharesOutstanding),
    }];
  });
};

const readMonteCarloSummary = (monteCarlo: Record<string, unknown> | null): MonteCarloSummary | undefined => {
  const summary = isRecord(monteCarlo?.summary) ? monteCarlo.summary : null;
  const runs = readFiniteNumber(monteCarlo?.runs);
  const min = readFiniteNumber(summary?.min);
  const max = readFiniteNumber(summary?.max);
  const mean = readFiniteNumber(summary?.mean);
  const median = readFiniteNumber(summary?.median);
  const p10 = readFiniteNumber(summary?.p10);
  const p25 = readFiniteNumber(summary?.p25);
  const p75 = readFiniteNumber(summary?.p75);
  const p90 = readFiniteNumber(summary?.p90);
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

const buildProvenance = (
  facts: EdgarFacts,
  latest: EdgarStatement,
): ValuationProvenance => ({
  symbol: facts.symbol,
  name: facts.name,
  cik: facts.cik,
  currency: facts.currency ?? latest.currency,
  source: facts.source,
  latestPeriodEnd: latest.period_end,
  latestFilingDate: latest.filing_date,
  latestStatementSource: latest.source,
});

export const normalizeDcfComputeResponse = (
  value: unknown,
  scenario: Scenario,
  facts?: EdgarFacts,
): DcfResult => {
  const payload = isRecord(value) ? value : null;
  if (!payload) {
    throw new Error('DCF compute response is invalid');
  }
  const scenarioResult = isRecord(payload?.[scenario]) ? payload[scenario] : null;
  const valuation = isRecord(scenarioResult?.valuation) ? scenarioResult.valuation : null;
  const fairValue = readFairValue(valuation);
  if (fairValue === null) {
    throw new Error('DCF compute response is missing fair value');
  }

  const monteCarlo = isRecord(payload?.monteCarlo) ? payload.monteCarlo : null;
  const summary = isRecord(monteCarlo?.summary) ? monteCarlo.summary : null;
  const p10 = readFiniteNumber(summary?.p10);
  const p90 = readFiniteNumber(summary?.p90);
  const sensitivity = isRecord(payload?.sensitivity) ? payload.sensitivity : null;
  const kpis = isRecord(payload?.kpis) ? payload.kpis : null;
  const latest = facts ? getLatestAnnualStatement(facts) : null;

  return {
    fairValue,
    range: p10 !== null && p90 !== null ? [p10, p90] : undefined,
    histogram: readHistogram(monteCarlo?.histogram),
    scenarios: {
      base: readScenarioValue(payload, 'base'),
      bull: readScenarioValue(payload, 'bull'),
      bear: readScenarioValue(payload, 'bear'),
    },
    sensitivityMatrix: readNumberMatrix(sensitivity?.values),
    sensitivity: {
      growthOffsets: readPercentPointOffsets(sensitivity?.growthOffsets),
      waccOffsets: readPercentPointOffsets(sensitivity?.waccOffsets),
    },
    projections: readProjections(payload[scenario]),
    kpis: readKpis(kpis?.kpis),
    statementHistory: readStatementHistory(kpis?.history),
    monteCarloSummary: readMonteCarloSummary(monteCarlo),
    provenance: latest
      ? buildProvenance(facts as EdgarFacts, latest)
      : { symbol: readString(payload.symbol) ?? '' },
  };
};

const computeDcf = async (
  inputs: DcfInputs,
  signal: AbortSignal,
): Promise<DcfResult> => {
  const searchParams = new URLSearchParams({ symbol: inputs.symbol });
  if (inputs.listingId) {
    searchParams.set('listingId', inputs.listingId);
  }
  const importFactsToken = readBrowserImportFactsToken();
  const useBrowserFactsRead = shouldUseBrowserFactsRead(inputs.listingId, importFactsToken);
  const factsUrl = useBrowserFactsRead
    ? `/api/company/facts/browser?${searchParams.toString()}`
    : `/api/company/facts?${searchParams.toString()}`;
  const facts = await fetchJson<EdgarFacts>(
    factsUrl,
    {
      method: 'GET',
      signal,
      headers: useBrowserFactsRead && importFactsToken
        ? { 'x-import-context-token': importFactsToken }
        : undefined,
    },
    'Company facts request',
  );
  const payload = buildWorkbenchPayload(inputs, facts);
  const result = await fetchJson<unknown>(
    '/api/dcf/preview?mc=default',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    },
    'DCF compute request',
  );
  return normalizeDcfComputeResponse(result, inputs.scenario, facts);
};

/**
 * Build a `compute` function and a `reset` function that operate on the
 * supplied mutable refs and push state through the supplied callbacks.
 *
 * This is intentionally framework-agnostic so it can be unit-tested without
 * mocking React.
 */
export function buildComputeFns(
  refs: ComputeRefs,
  cbs: ComputeCallbacks,
  debounceMs: number,
) {
  const compute = (inputs: DcfInputs): Promise<DcfResult> => {
    const myRequestId = ++refs.requestId;

    // Clear any pending debounce and reject the superseded promise
    if (refs.debounceTimer) {
      clearTimeout(refs.debounceTimer);
      if (refs.pendingReject) {
        refs.pendingReject(new DOMException('Superseded', 'AbortError'));
        refs.pendingReject = null;
      }
    }

    // Abort any in-flight request
    if (refs.abortController) {
      refs.abortController.abort();
    }

    return new Promise<DcfResult>((resolve, reject) => {
      refs.pendingReject = reject;

      refs.debounceTimer = setTimeout(async () => {
        refs.pendingReject = null;

        if (refs.requestId === myRequestId) {
          cbs.setIsLoading(true);
          cbs.setError(null);
        }

        const controller = new AbortController();
        refs.abortController = controller;

        try {
          const data = await computeDcf(inputs, controller.signal);

          if (refs.requestId === myRequestId) {
            cbs.setResult(data);
          }
          resolve(data);
        } catch (err) {
          const error =
            err instanceof Error ? err : new Error('Unknown error');
          if (error.name !== 'AbortError' && refs.requestId === myRequestId) {
            cbs.setError(error);
          }
          // Always settle the promise, even on AbortError
          reject(error);
        } finally {
          if (refs.requestId === myRequestId) {
            cbs.setIsLoading(false);
          }
        }
      }, debounceMs);
    });
  };

  const reset = () => {
    cbs.setResult(null);
    cbs.setError(null);
    cbs.setIsLoading(false);

    if (refs.abortController) {
      refs.abortController.abort();
    }
    if (refs.debounceTimer) {
      clearTimeout(refs.debounceTimer);
    }
    if (refs.pendingReject) {
      refs.pendingReject(new DOMException('Reset', 'AbortError'));
      refs.pendingReject = null;
    }
    ++refs.requestId;
  };

  return { compute, reset };
}

// ---------------------------------------------------------------------------
// React hook — thin wrapper around the core logic
// ---------------------------------------------------------------------------

/**
 * Hook to compute DCF valuations via the API.
 * Includes debouncing and loading state management.
 */
export function useDcfCompute(options: UseDcfComputeOptions = {}) {
  const { debounceMs = 300 } = options;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<DcfResult | null>(null);

  const refsRef = useRef<ComputeRefs>(createComputeRefs());

  // Cleanup on unmount
  useEffect(() => {
    const r = refsRef.current;
    return () => {
      if (r.abortController) {
        r.abortController.abort();
      }
      if (r.debounceTimer) {
        clearTimeout(r.debounceTimer);
      }
      if (r.pendingReject) {
        r.pendingReject(new DOMException('Unmounted', 'AbortError'));
      }
    };
  }, []);

  const compute = useCallback(
    (inputs: DcfInputs) => {
      const fns = buildComputeFns(
        refsRef.current,
        { setIsLoading, setError, setResult },
        debounceMs,
      );
      return fns.compute(inputs);
    },
    [debounceMs],
  );

  const reset = useCallback(() => {
    const fns = buildComputeFns(
      refsRef.current,
      { setIsLoading, setError, setResult },
      debounceMs,
    );
    fns.reset();
  }, [debounceMs]);

  return {
    compute,
    reset,
    result,
    isLoading,
    error,
  };
}
