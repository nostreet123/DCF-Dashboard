'use client';

import { useEffect, useMemo, useState } from 'react';
import { getDashboardDataMode } from '@/lib/dashboardDataMode';
import {
  buildValuationHistoryPath,
  buildValuationRunDetailPath,
  mapValuationRunsToHistoryItems,
  type ValuationHistoryItem,
  type ValuationReplaySnapshot,
  type ValuationRun,
} from '@/lib/valuationHistory';
import { mockDemoReplaySnapshot, mockRunHistory } from '@/lib/workbench/mockData';

export {
  buildValuationHistoryPath,
  buildValuationRunDetailPath,
  mapValuationRunsToHistoryItems,
  normalizeValuationReplay,
  type ValuationHistoryItem,
  type ValuationReplaySnapshot,
  type ValuationRun,
} from '@/lib/valuationHistory';

type ValuationHistoryResult = {
  runs: ValuationHistoryItem[];
  isLoading: boolean;
  error: Error | null;
  latestRun: ValuationHistoryItem | null;
  refresh: () => void;
};

type ValuationReplayResult = {
  activeRunId: string | null;
  replay: ValuationReplaySnapshot | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
};

type ValuationHistoryLookup = {
  symbol?: string;
  primaryKeyNorm?: string;
  regionCode?: string;
  limit?: number;
};

type ValuationHistoryOptions = {
  enabled?: boolean;
  browserReads?: boolean;
};

type ValuationHistoryErrorInput = {
  status?: number;
  message?: string;
};

const HISTORY_REQUEST_DEBOUNCE_MS = 200;

export function toUserFacingValuationHistoryError({
  status,
}: ValuationHistoryErrorInput): Error {
  if (status === 401) {
    return new Error('Recent runs are unavailable in this environment.');
  }

  if (status === 429) {
    return new Error('Recent runs are temporarily unavailable. Try again in a moment.');
  }

  if (status === 404) {
    return new Error('That saved valuation is no longer available.');
  }

  if (status === 503) {
    return new Error('Recent runs are unavailable right now.');
  }

  return new Error('Unable to load recent runs.');
}

function useValuationHistoryRequest(
  lookup: ValuationHistoryLookup,
  options: ValuationHistoryOptions = {},
): ValuationHistoryResult {
  const isDemo = getDashboardDataMode() === 'demo';
  const demoRuns = useMemo<ValuationHistoryItem[]>(
    () => (isDemo ? mockRunHistory : []),
    [isDemo],
  );

  const [runs, setRuns] = useState<ValuationHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const path =
    options.enabled === false || isDemo
      ? null
      : buildValuationHistoryPath(lookup, { browserReads: options.browserReads });

  useEffect(() => {
    if (!path) {
      setRuns([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    let didCancel = false;
    setIsLoading(true);
    setError(null);

    const load = async () => {
      try {
        const response = await fetch(path, {
          method: 'GET',
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string;
          code?: string;
          runs?: ValuationRun[];
        };
        if (!response.ok) {
          throw toUserFacingValuationHistoryError({
            status: response.status,
            message: payload.message,
          });
        }
        if (!didCancel) {
          setRuns(mapValuationRunsToHistoryItems(payload.runs ?? []));
        }
      } catch (fetchError) {
        if (didCancel) {
          return;
        }
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          return;
        }
        setRuns([]);
        setError(
          fetchError instanceof Error
            ? fetchError
            : toUserFacingValuationHistoryError({}),
        );
      } finally {
        if (!didCancel) {
          setIsLoading(false);
        }
      }
    };

    const timeoutId = window.setTimeout(() => {
      void load();
    }, HISTORY_REQUEST_DEBOUNCE_MS);

    return () => {
      didCancel = true;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [path, refreshToken]);

  const effectiveRuns = isDemo ? demoRuns : runs;

  return {
    runs: effectiveRuns,
    isLoading,
    error,
    latestRun: effectiveRuns[0] ?? null,
    refresh: () => {
      setRefreshToken((value) => value + 1);
    },
  };
}

function useValuationReplayRequest(
  runId: string | undefined,
  options: ValuationHistoryOptions = {},
): ValuationReplayResult {
  const isDemo = getDashboardDataMode() === 'demo';
  const isDemoRun = isDemo && runId !== undefined && mockRunHistory.some((r) => r.id === runId);

  const [activeRunId, setActiveRunId] = useState<string | null>(runId ?? null);
  const [replay, setReplay] = useState<ValuationReplaySnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const path =
    options.enabled === false || isDemoRun
      ? null
      : buildValuationRunDetailPath(runId, { browserReads: options.browserReads });

  useEffect(() => {
    if (!path) {
      setActiveRunId(null);
      setReplay(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    let didCancel = false;
    setActiveRunId(runId ?? null);
    setReplay(null);
    setIsLoading(true);
    setError(null);

    const load = async () => {
      try {
        const response = await fetch(path, {
          method: 'GET',
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string;
          replay?: ValuationReplaySnapshot;
        };
        if (!response.ok) {
          throw toUserFacingValuationHistoryError({
            status: response.status,
            message: payload.message,
          });
        }
        if (!didCancel) {
          setReplay(payload.replay ?? null);
        }
      } catch (fetchError) {
        if (didCancel) {
          return;
        }
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          return;
        }
        setReplay(null);
        setError(
          fetchError instanceof Error
            ? fetchError
            : toUserFacingValuationHistoryError({}),
        );
      } finally {
        if (!didCancel) {
          setIsLoading(false);
        }
      }
    };

    const timeoutId = window.setTimeout(() => {
      void load();
    }, HISTORY_REQUEST_DEBOUNCE_MS);

    return () => {
      didCancel = true;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [path, refreshToken, runId]);

  const effectiveReplay = isDemoRun
    ? ({ ...mockDemoReplaySnapshot, runId: runId ?? mockDemoReplaySnapshot.runId } as ValuationReplaySnapshot)
    : replay;

  return {
    activeRunId,
    replay: effectiveReplay,
    isLoading,
    error,
    refresh: () => {
      setRefreshToken((value) => value + 1);
    },
  };
}

export function useValuationHistory(
  symbol: string | undefined,
  limit: number = 10,
  options: ValuationHistoryOptions = {},
): ValuationHistoryResult {
  return useValuationHistoryRequest({ symbol, limit }, options);
}

export function useValuationHistoryByKey(
  primaryKeyNorm: string | undefined,
  regionCode?: string,
  limit: number = 10,
  options: ValuationHistoryOptions = {},
): ValuationHistoryResult {
  return useValuationHistoryRequest({ primaryKeyNorm, regionCode, limit }, options);
}

export function useValuationReplay(
  runId: string | undefined,
  options: ValuationHistoryOptions = {},
): ValuationReplayResult {
  return useValuationReplayRequest(runId, options);
}
