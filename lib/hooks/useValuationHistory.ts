'use client';

import { useEffect, useState } from 'react';
import {
  buildValuationHistoryPath,
  buildValuationRunDetailPath,
  mapValuationRunsToHistoryItems,
  type ValuationHistoryItem,
  type ValuationReplaySnapshot,
  type ValuationRun,
} from '@/lib/valuationHistory';

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

type ValuationHistoryErrorInput = {
  status?: number;
  message?: string;
};

const HISTORY_REQUEST_DEBOUNCE_MS = 200;

export function toUserFacingValuationHistoryError({
  status,
}: ValuationHistoryErrorInput): Error {
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

function useValuationHistoryRequest(lookup: ValuationHistoryLookup): ValuationHistoryResult {
  const [runs, setRuns] = useState<ValuationHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const path = buildValuationHistoryPath(lookup);

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

  return {
    runs,
    isLoading,
    error,
    latestRun: runs[0] ?? null,
    refresh: () => {
      setRefreshToken((value) => value + 1);
    },
  };
}

function useValuationReplayRequest(runId: string | undefined): ValuationReplayResult {
  const [replay, setReplay] = useState<ValuationReplaySnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const path = buildValuationRunDetailPath(runId);

  useEffect(() => {
    if (!path) {
      setReplay(null);
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
  }, [path, refreshToken]);

  return {
    replay,
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
): ValuationHistoryResult {
  return useValuationHistoryRequest({ symbol, limit });
}

export function useValuationHistoryByKey(
  primaryKeyNorm: string | undefined,
  regionCode?: string,
  limit: number = 10,
): ValuationHistoryResult {
  return useValuationHistoryRequest({ primaryKeyNorm, regionCode, limit });
}

export function useValuationReplay(runId: string | undefined): ValuationReplayResult {
  return useValuationReplayRequest(runId);
}
