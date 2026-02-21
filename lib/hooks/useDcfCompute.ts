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

/**
 * Hook to compute DCF valuations via the API.
 * Includes debouncing and loading state management.
 */
export function useDcfCompute(options: UseDcfComputeOptions = {}) {
  const { debounceMs = 300 } = options;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<DcfResult | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingRejectRef = useRef<((reason: unknown) => void) | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pendingRejectRef.current) {
        const err = new DOMException('Component unmounted', 'AbortError');
        pendingRejectRef.current(err);
        pendingRejectRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const compute = useCallback(
    async (inputs: DcfInputs) => {
      // Reject any promise still waiting in the debounce queue
      if (pendingRejectRef.current) {
        const supersededErr = new DOMException('Superseded by newer call', 'AbortError');
        pendingRejectRef.current(supersededErr);
        pendingRejectRef.current = null;
      }

      // Clear any pending debounce
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Abort any in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      return new Promise<DcfResult>((resolve, reject) => {
        pendingRejectRef.current = reject;

        debounceTimerRef.current = setTimeout(async () => {
          // This promise is now executing — clear the debounce-queue reference
          pendingRejectRef.current = null;

          setIsLoading(true);
          setError(null);

          const controller = new AbortController();
          abortControllerRef.current = controller;

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
            setResult(data);
            resolve(data);
          } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
              // Settle the promise so callers don't hang
              reject(err);
              return;
            }
            const error = err instanceof Error ? err : new Error('Unknown error');
            setError(error);
            reject(error);
          } finally {
            setIsLoading(false);
          }
        }, debounceMs);
      });
    },
    [debounceMs]
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    compute,
    reset,
    result,
    isLoading,
    error,
  };
}
