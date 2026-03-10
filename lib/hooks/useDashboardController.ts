'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useCurrentAssumptions, useWorkbench } from '@/lib/contexts/WorkbenchContext';
import {
  applyAssumptionChange,
  clearComputeTimeout,
} from '@/lib/hooks/dashboardControllerTiming';
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
  mockRunHistory,
  scenarioValues,
} from '@/lib/workbench/mockData';

export function useDashboardController() {
  const {
    scenario,
    selectedCompanyId,
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

  const currentValue = result?.fairValue ?? scenarioValues[scenario];
  const histogram = result?.histogram ?? mockHistogram;
  const valuationRange = result?.range ?? fallbackRange;

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
    mockDatasets,
    mockPriceHistory,
    mockRunHistory,
    openAssumptionsDrawer,
    openLibraryDrawer,
    scenario,
    searchFeedback,
    setScenario,
    valuationRange,
  };
}
