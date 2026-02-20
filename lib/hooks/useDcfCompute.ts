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
  
  // Track the latest request ID to guard state updates
  const requestIdRef = useRef<number>(0);
  // Store the pending reject function for debounced promises
  const pendingRejectRef = useRef<((reason?: any) => void) | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (pendingRejectRef.current) {
        pendingRejectRef.current(new DOMException('Unmounted', 'AbortError'));
      }
    };
  }, []);

  const compute = useCallback(
    async (inputs: DcfInputs) => {
      const myRequestId = ++requestIdRef.current;

      // Clear any pending debounce and reject the superseded promise
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        if (pendingRejectRef.current) {
          pendingRejectRef.current(new DOMException('Superseded', 'AbortError'));
          pendingRejectRef.current = null;
        }
      }

      // Abort any in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      return new Promise<DcfResult>((resolve, reject) => {
        pendingRejectRef.current = reject;

        debounceTimerRef.current = setTimeout(async () => {
          pendingRejectRef.current = null;
          
          if (requestIdRef.current === myRequestId) {
            setIsLoading(true);
            setError(null);
          }

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
            
            if (requestIdRef.current === myRequestId) {
              setResult(data);
            }
            resolve(data);
          } catch (err) {
            const error = err instanceof Error ? err : new Error('Unknown error');
            if (error.name !== 'AbortError' && requestIdRef.current === myRequestId) {
              setError(error);
            }
            // Always settle the promise, even on AbortError
            reject(error);
          } finally {
            if (requestIdRef.current === myRequestId) {
              setIsLoading(false);
            }
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
    
    // Also cancel any pending work
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (pendingRejectRef.current) {
      pendingRejectRef.current(new DOMException('Reset', 'AbortError'));
      pendingRejectRef.current = null;
    }
    ++requestIdRef.current;
  }, []);

  return {
    compute,
    reset,
    result,
    isLoading,
    error,
  };
}
