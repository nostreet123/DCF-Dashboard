'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface DcfInputs {
  symbol: string;
  revenueGrowth: number;
  operatingMargin: number;
  discountRate: number;
  terminalGrowth: number;
  scenario?: 'base' | 'bull' | 'bear';
}

interface DcfResult {
  fairValue: number;
  range: [number, number];
  histogram: {
    binCenters: number[];
    density: number[];
  };
  sensitivityMatrix: number[][];
  projections: Array<{
    year: number;
    revenue: number;
    operatingIncome: number;
    freeCashFlow: number;
  }>;
}

interface UseDcfComputeOptions {
  debounceMs?: number;
}

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
          const response = await fetch('/api/dcf/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(inputs),
            signal: controller.signal,
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${response.status}`);
          }

          const data = await response.json();

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
