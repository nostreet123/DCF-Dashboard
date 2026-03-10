'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useCurrentAssumptions, useWorkbench } from '@/lib/contexts/WorkbenchContext';
import {
  applyAssumptionChange,
  clearComputeTimeout,
} from '@/lib/hooks/dashboardControllerTiming';
import {
  type ValuationReplaySnapshot,
  useValuationHistory,
  useValuationReplay,
} from '@/lib/hooks/useValuationHistory';
import {
  resolveActiveCompany,
  type RailVariant,
  useWorkbenchViewState,
} from '@/lib/hooks/useWorkbenchViewState';
import {
  fallbackRange,
  findMockCompanyBySearch,
  mockDatasets,
  mockHistogram,
  mockPriceHistory,
  scenarioValues,
} from '@/lib/workbench/mockData';

type Histogram = {
  binCenters: number[];
  density: number[];
};

type LiveValuationResult = {
  fairValue: number;
  range: [number, number];
  histogram: Histogram;
  sensitivityMatrix: number[][];
};

export function resolveDisplayedValuationData({
  scenario,
  liveResult,
  replaySnapshot,
  scenarioFallbacks,
  fallbackRange,
  fallbackHistogram,
}: {
  scenario: 'base' | 'bull' | 'bear';
  liveResult: LiveValuationResult | null;
  replaySnapshot: ValuationReplaySnapshot | null;
  scenarioFallbacks: Record<'base' | 'bull' | 'bear', number>;
  fallbackRange: [number, number];
  fallbackHistogram: Histogram;
}) {
  if (replaySnapshot) {
    return {
      currentValue: replaySnapshot.scenarios[scenario].fairValue,
      valuationRange: replaySnapshot.range,
      histogram: replaySnapshot.histogram,
    };
  }

  return {
    currentValue: liveResult?.fairValue ?? scenarioFallbacks[scenario],
    valuationRange: liveResult?.range ?? fallbackRange,
    histogram: liveResult?.histogram ?? fallbackHistogram,
  };
}

export function useDashboardController() {
  const {
    scenario,
    selectedCompanyId,
    selectedRunId,
    selectCompany,
    setScenario,
    setSelectedRunId,
    updateAssumption,
    isComputing,
    setIsComputing,
    error,
    setError,
    result,
  } = useWorkbench();
  const assumptions = useCurrentAssumptions();
  const {
    activeDrawer,
    openLibraryDrawer,
    openAssumptionsDrawer,
    closeDrawers,
    onCompanySelected,
    onRunSelected,
  } = useWorkbenchViewState();

  const computeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      clearComputeTimeout(computeTimeoutRef);
    };
  }, []);

  const activeCompany = resolveActiveCompany(mockDatasets, selectedCompanyId);
  const activeCompanyId = activeCompany?.id ?? null;
  const activeTicker = activeCompany?.ticker ?? 'AAPL';
  const {
    runs: runHistory,
    isLoading: isRunHistoryLoading,
    error: runHistoryError,
  } = useValuationHistory(activeTicker, 5);
  const {
    activeRunId: replayRunId,
    replay,
    isLoading: isReplayLoading,
    error: replayError,
  } = useValuationReplay(selectedRunId ?? undefined);

  useEffect(() => {
    if (replayError && selectedRunId && replayRunId === selectedRunId) {
      setSelectedRunId(null);
    }
  }, [replayError, replayRunId, selectedRunId, setSelectedRunId]);

  const handleAssumptionChange = useCallback(
    (key: Extract<keyof typeof assumptions, string>, value: number) => {
      setError(null);
      applyAssumptionChange(computeTimeoutRef, {
        key,
        value,
        setIsComputing,
        updateAssumption,
      });
    },
    [setError, setIsComputing, updateAssumption],
  );

  const handleSelectCompany = useCallback(
    (id: string, source: RailVariant) => {
      const company = resolveActiveCompany(mockDatasets, id);
      setError(null);
      setSearchFeedback(null);
      selectCompany(company?.id ?? id, company?.ticker ?? null);
      onCompanySelected(source);
    },
    [onCompanySelected, selectCompany, setError],
  );

  const handleSelectRun = useCallback(
    (id: string, source: RailVariant) => {
      setError(null);
      setSelectedRunId(id);
      onRunSelected(source);
    },
    [onRunSelected, setError, setSelectedRunId],
  );

  const handleSearch = useCallback(
    (query: string) => {
      const normalizedQuery = query.trim();
      if (!normalizedQuery) {
        setSearchFeedback('Enter a ticker or company name to search.');
        return;
      }

      const company = findMockCompanyBySearch(normalizedQuery);
      if (company) {
        setError(null);
        setSearchFeedback(null);
        selectCompany(company.id, company.ticker);
        return;
      }

      setSearchFeedback(`No matching company found for "${normalizedQuery}".`);
    },
    [selectCompany, setError],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, [setError]);

  const { currentValue, histogram, valuationRange } = resolveDisplayedValuationData({
    scenario,
    liveResult: result,
    replaySnapshot: replay,
    scenarioFallbacks: scenarioValues,
    fallbackRange,
    fallbackHistogram: mockHistogram,
  });

  return {
    activeCompanyId,
    activeDrawer,
    activeTicker,
    assumptions,
    closeDrawers,
    clearError,
    currentValue,
    error,
    handleAssumptionChange,
    handleSearch,
    handleSelectCompany,
    handleSelectRun,
    histogram,
    isComputing,
    isReplayLoading,
    isRunHistoryLoading,
    mockDatasets,
    mockPriceHistory,
    openAssumptionsDrawer,
    openLibraryDrawer,
    replayError,
    runHistory,
    runHistoryError,
    scenario,
    searchFeedback,
    selectedRunId,
    setScenario,
    valuationRange,
  };
}
