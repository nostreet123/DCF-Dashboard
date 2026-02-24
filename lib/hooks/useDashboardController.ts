'use client';

import { useCallback, useEffect, useRef } from 'react';
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
    result,
  } = useWorkbench();
  const assumptions = useCurrentAssumptions();
  const {
    viewMode,
    setViewMode,
    activeDrawer,
    openLibraryDrawer,
    openAssumptionsDrawer,
    closeDrawers,
    onCompanySelected,
    onRunSelected,
  } = useWorkbenchViewState();

  const computeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      applyAssumptionChange(computeTimeoutRef, {
        key,
        value,
        setIsComputing,
        updateAssumption,
      });
    },
    [setIsComputing, updateAssumption],
  );

  const handleSelectCompany = useCallback(
    (id: string, source: RailVariant) => {
      const company = resolveActiveCompany(mockDatasets, id);
      selectCompany(company?.id ?? id, company?.ticker ?? null);
      onCompanySelected(source);
    },
    [onCompanySelected, selectCompany],
  );

  const handleSelectRun = useCallback(
    (id: string, source: RailVariant) => {
      setSelectedRunId(id);
      onRunSelected(source);
    },
    [onRunSelected, setSelectedRunId],
  );

  const handleSearch = useCallback(
    (query: string) => {
      const company = findMockCompanyBySearch(query);
      if (company) {
        selectCompany(company.id, company.ticker);
      }
    },
    [selectCompany],
  );

  const currentValue = result?.fairValue ?? scenarioValues[scenario];
  const histogram = result?.histogram ?? mockHistogram;
  const valuationRange = result?.range ?? fallbackRange;

  return {
    activeCompanyId,
    activeDrawer,
    activeTicker,
    assumptions,
    closeDrawers,
    currentValue,
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
    setScenario,
    setViewMode,
    valuationRange,
    viewMode,
  };
}
