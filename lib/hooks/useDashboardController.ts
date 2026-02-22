'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useCurrentAssumptions, useWorkbench } from '@/lib/contexts/WorkbenchContext';
import {
  type DatasetGroups,
  resolveActiveCompany,
  type RailVariant,
  useWorkbenchViewState,
} from '@/lib/hooks/useWorkbenchViewState';

const mockDatasets: DatasetGroups = {
  Technology: [
    { id: '1', name: 'Apple Inc.', ticker: 'AAPL' },
    { id: '2', name: 'Microsoft Corp.', ticker: 'MSFT' },
    { id: '3', name: 'Alphabet Inc.', ticker: 'GOOGL' },
    { id: '4', name: 'Amazon.com Inc.', ticker: 'AMZN' },
  ],
  Finance: [
    { id: '5', name: 'JPMorgan Chase', ticker: 'JPM' },
    { id: '6', name: 'Goldman Sachs', ticker: 'GS' },
  ],
  Healthcare: [
    { id: '7', name: 'Johnson & Johnson', ticker: 'JNJ' },
    { id: '8', name: 'Pfizer Inc.', ticker: 'PFE' },
  ],
};

const mockRunHistory = [
  { id: 'r1', timestamp: new Date(Date.now() - 3600000), ticker: 'AAPL', value: 145.2 },
  { id: 'r2', timestamp: new Date(Date.now() - 7200000), ticker: 'MSFT', value: 378.5 },
  { id: 'r3', timestamp: new Date(Date.now() - 86400000), ticker: 'GOOGL', value: 142.8 },
];

const mockPriceHistory = [140, 142, 138, 145, 143, 148, 146, 150, 152];

const mockHistogram = {
  binCenters: [100, 110, 120, 130, 140, 150, 160, 170, 180, 190],
  density: [0.02, 0.05, 0.12, 0.22, 0.28, 0.18, 0.08, 0.03, 0.015, 0.005],
};

const scenarioValues = {
  base: 145.2,
  bull: 185.5,
  bear: 112.3,
};

const fallbackRange: [number, number] = [112.3, 185.5];

function findCompanyBySearch(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const allCompanies = Object.values(mockDatasets).flat();
  return (
    allCompanies.find(
      (item) =>
        item.ticker.toLowerCase() === normalized || item.name.toLowerCase().includes(normalized),
    ) ?? null
  );
}

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
    getRailSelectionHandlers,
  } = useWorkbenchViewState();

  const computeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (computeTimeoutRef.current) {
        clearTimeout(computeTimeoutRef.current);
      }
    };
  }, []);

  const activeCompany = resolveActiveCompany(mockDatasets, selectedCompanyId);
  const activeCompanyId = activeCompany?.id ?? null;
  const activeTicker = activeCompany?.ticker ?? 'AAPL';

  const handleAssumptionChange = useCallback(
    (key: keyof typeof assumptions, value: number) => {
      setIsComputing(true);
      if (computeTimeoutRef.current) {
        clearTimeout(computeTimeoutRef.current);
      }
      computeTimeoutRef.current = setTimeout(() => {
        setIsComputing(false);
        computeTimeoutRef.current = null;
      }, 520);

      updateAssumption(key, value);
    },
    [setIsComputing, updateAssumption],
  );

  const handleSelectCompany = useCallback(
    (id: string, source: RailVariant) => {
      const company = resolveActiveCompany(mockDatasets, id);
      selectCompany(company?.id ?? id, company?.ticker ?? null);
      getRailSelectionHandlers(source).onCompanySelected();
    },
    [getRailSelectionHandlers, selectCompany],
  );

  const handleSelectRun = useCallback(
    (id: string, source: RailVariant) => {
      setSelectedRunId(id);
      getRailSelectionHandlers(source).onRunSelected();
    },
    [getRailSelectionHandlers, setSelectedRunId],
  );

  const handleSearch = useCallback(
    (query: string) => {
      const company = findCompanyBySearch(query);
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
