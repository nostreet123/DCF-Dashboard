'use client';

import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';

interface ValuationRun {
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
    fairValue?: number;
    range?: [number, number];
    histogram?: {
      binCenters: number[];
      density: number[];
    };
  };
  primaryKeyNorm?: string;
  regionCode?: string;
  asOfDate?: string;
  traceStorage: 'none' | 'inline' | 'external';
}

/**
 * Hook to fetch valuation history for a symbol.
 */
export function useValuationHistory(symbol: string | undefined, limit: number = 10) {
  const data = useQuery(
    api.valuations.listByTicker,
    symbol ? { symbol, limit } : 'skip'
  );

  const isLoading = symbol !== undefined && data === undefined;

  return {
    runs: (data as ValuationRun[] | undefined) ?? [],
    isLoading,
    latestRun: data?.[0] as ValuationRun | undefined,
  };
}

/**
 * Hook to fetch valuation history by primary key and region.
 */
export function useValuationHistoryByKey(
  primaryKeyNorm: string | undefined,
  regionCode?: string,
  limit: number = 10
) {
  const data = useQuery(
    api.valuations.listBySymbol,
    primaryKeyNorm ? { primaryKeyNorm, regionCode, limit } : 'skip'
  );

  const isLoading = primaryKeyNorm !== undefined && data === undefined;

  return {
    runs: (data as ValuationRun[] | undefined) ?? [],
    isLoading,
    latestRun: data?.[0] as ValuationRun | undefined,
  };
}
