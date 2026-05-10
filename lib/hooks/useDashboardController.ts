'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getBestValuationSearchResult,
  getCompanyCoverageState,
  getCompanySearchId,
  getCompanySearchSymbol,
  type CompanySearchResult,
} from '@/lib/companySearch';
import { useCurrentAssumptions, useWorkbench } from '@/lib/contexts/WorkbenchContext';
import {
  areBrowserHistoryReadsEnabled,
  getDashboardDataMode,
} from '@/lib/dashboardDataMode';
import { useDcfCompute, type DcfResult } from '@/lib/hooks/useDcfCompute';
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
  mockKpis,
  mockDatasets,
  mockHistogram,
  mockMonteCarloSummary,
  mockPriceHistory,
  mockProjectionRows,
  mockProvenance,
  mockRunHistory,
  mockSensitivityMatrix,
  mockStatementHistory,
  scenarioValues,
} from '@/lib/workbench/mockData';

export function resolveDisplayedValuationData({
  scenario,
  liveResult,
  replaySnapshot,
}: {
  scenario: 'base' | 'bull' | 'bear';
  liveResult: DcfResult | null;
  replaySnapshot: ValuationReplaySnapshot | null;
}) {
  if (replaySnapshot) {
    return {
      currentValue: replaySnapshot.scenarios[scenario].fairValue,
      valuationRange: replaySnapshot.range,
      histogram: replaySnapshot.histogram,
    };
  }

  return {
    currentValue: liveResult?.fairValue ?? null,
    valuationRange: liveResult?.range,
    histogram: liveResult?.histogram,
  };
}

const getDemoResult = (scenario: 'base' | 'bull' | 'bear'): DcfResult => ({
  fairValue: scenarioValues[scenario],
  range: fallbackRange,
  histogram: mockHistogram,
  scenarios: scenarioValues,
  sensitivityMatrix: mockSensitivityMatrix,
  sensitivity: {
    growthOffsets: [-2, -1, 0, 1, 2],
    waccOffsets: [-2, -1, 0, 1, 2],
  },
  projections: mockProjectionRows,
  kpis: mockKpis,
  statementHistory: mockStatementHistory,
  monteCarloSummary: mockMonteCarloSummary,
  provenance: mockProvenance,
});

const getDemoReplay = (
  runId: string | undefined | null,
): ValuationReplaySnapshot | null => {
  if (!runId) {
    return null;
  }
  const run = mockRunHistory.find((item) => item.id === runId);
  if (!run) {
    return null;
  }
  return {
    runId: run.id,
    ticker: run.ticker,
    createdAt: run.timestamp.getTime(),
    scenarios: {
      base: { fairValue: run.value },
      bull: { fairValue: Math.round(run.value * 1.28 * 100) / 100 },
      bear: { fairValue: Math.round(run.value * 0.78 * 100) / 100 },
    },
    range: [
      Math.round(run.value * 0.77 * 100) / 100,
      Math.round(run.value * 1.28 * 100) / 100,
    ],
    histogram: mockHistogram,
  };
};

const RUN_HISTORY_DISABLED_ERROR = new Error('Recent runs are unavailable in this environment.');

const getDemoSearchResults = (query: string, limit: number): CompanySearchResult[] => {
  const normalizedLower = query.toLowerCase();
  return Object.values(mockDatasets)
    .flat()
    .filter(
      (company) =>
        company.ticker.toLowerCase().includes(normalizedLower) ||
        company.name.toLowerCase().includes(normalizedLower),
    )
    .slice(0, limit)
    .map((company) => ({
      id: company.id,
      listing_id: `XNAS:${company.ticker}`,
      symbol: company.ticker,
      name: company.name,
      exchangeMic: 'XNAS',
      market: 'Nasdaq',
      country: 'US',
      currency: 'USD',
      coverageState: 'valuation_ready',
      coverageReason: 'Valuation-ready from the demo catalog.',
      sourceLinks: [],
      exchange: 'Nasdaq',
      mic: 'XNAS',
      country_code: 'US',
      coverage_state: 'valuation_ready',
      source_system: 'Demo catalog',
    }));
};

export function useDashboardController() {
  const {
    scenario,
    assumptions: scenarioAssumptions,
    selectedCompanyId,
    selectedSymbol,
    selectedRunId,
    selectCompany,
    setScenario,
    setSelectedRunId,
    updateAssumption,
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
  const {
    compute,
    reset,
    result,
    isLoading: isComputing,
    error,
  } = useDcfCompute();

  const [searchFeedback, setSearchFeedback] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<CompanySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const searchRequestIdRef = useRef(0);
  const isDemoMode = getDashboardDataMode() === 'demo';
  const shouldLoadBrowserHistory = !isDemoMode && areBrowserHistoryReadsEnabled();

  const activeCompany = resolveActiveCompany(mockDatasets, selectedCompanyId);
  const activeCompanyId = selectedCompanyId ?? activeCompany?.id ?? null;
  const activeTicker = selectedSymbol ?? activeCompany?.ticker ?? 'AAPL';
  const {
    runs: liveRunHistory,
    isLoading: isRunHistoryLoading,
    error: runHistoryError,
  } = useValuationHistory(activeTicker, 5, {
    enabled: shouldLoadBrowserHistory,
    browserReads: shouldLoadBrowserHistory,
  });
  const {
    activeRunId: replayRunId,
    replay: liveReplay,
    isLoading: isReplayLoading,
    error: replayError,
  } = useValuationReplay(selectedRunId ?? undefined, {
    enabled: shouldLoadBrowserHistory,
    browserReads: shouldLoadBrowserHistory,
  });
  const demoReplay = isDemoMode ? getDemoReplay(selectedRunId) : null;
  const replay = isDemoMode ? demoReplay : liveReplay;
  const resultForDisplay = isDemoMode ? getDemoResult(scenario) : result;
  const runHistory = isDemoMode
    ? mockRunHistory.filter((run) => run.ticker === activeTicker)
    : liveRunHistory;
  const effectiveRunHistoryError =
    isDemoMode || shouldLoadBrowserHistory
      ? runHistoryError
      : RUN_HISTORY_DISABLED_ERROR;

  useEffect(() => {
    if (!isDemoMode && replayError && selectedRunId && replayRunId === selectedRunId) {
      setSelectedRunId(null);
    }
  }, [isDemoMode, replayError, replayRunId, selectedRunId, setSelectedRunId]);

  useEffect(() => {
    if (isDemoMode) {
      return;
    }
    void compute({
      symbol: activeTicker,
      listingId: activeCompanyId,
      scenario,
      assumptions: scenarioAssumptions,
    }).catch(() => {
      // useDcfCompute stores the error for rendering.
    });
  }, [activeCompanyId, activeTicker, compute, isDemoMode, retryToken, scenario, scenarioAssumptions]);

  const handleAssumptionChange = useCallback(
    (key: Extract<keyof typeof assumptions, string>, value: number) => {
      setSelectedRunId(null);
      updateAssumption(key, value);
    },
    [setSelectedRunId, updateAssumption],
  );

  const handleSelectCompany = useCallback(
    (id: string, source: RailVariant) => {
      const company = resolveActiveCompany(mockDatasets, id);
      setSearchFeedback(null);
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

  const fetchSearchResults = useCallback(
    async (query: string, limit: number): Promise<CompanySearchResult[]> => {
      const normalizedQuery = query.trim();
      if (!normalizedQuery) {
        setSearchResults([]);
        return [];
      }

      const requestId = searchRequestIdRef.current + 1;
      searchRequestIdRef.current = requestId;
      setIsSearching(true);

      if (isDemoMode) {
        const results = getDemoSearchResults(normalizedQuery, limit);
        if (requestId === searchRequestIdRef.current) {
          setSearchResults(results);
          setIsSearching(false);
        }
        return results;
      }

      try {
        const response = await fetch(
          `/api/company/search?q=${encodeURIComponent(normalizedQuery)}&limit=${limit}`,
          { method: 'GET' },
        );
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string;
          results?: CompanySearchResult[];
        };
        if (requestId !== searchRequestIdRef.current) {
          return [];
        }
        if (!response.ok) {
          throw new Error(payload.message ?? `Search failed (${response.status})`);
        }
        const results = payload.results ?? [];
        setSearchResults(results);
        return results;
      } catch (searchError) {
        if (requestId !== searchRequestIdRef.current) {
          return [];
        }
        setSearchResults([]);
        setSearchFeedback(
          searchError instanceof Error ? searchError.message : 'Company search failed.',
        );
        return [];
      } finally {
        if (requestId === searchRequestIdRef.current) {
          setIsSearching(false);
        }
      }
    },
    [isDemoMode],
  );

  const handleSelectSearchResult = useCallback(
    (company: CompanySearchResult) => {
      const symbol = getCompanySearchSymbol(company);
      if (!symbol) {
        setSearchFeedback('Search result did not include a ticker symbol.');
        return;
      }
      if (getCompanyCoverageState(company) !== 'valuation_ready') {
        setSearchFeedback(
          `${company.name ?? symbol} is searchable, but valuation needs imported statements first.`,
        );
        return;
      }
      setSearchFeedback(null);
      setSearchResults([]);
      selectCompany(getCompanySearchId(company, symbol), symbol);
    },
    [selectCompany],
  );

  const handleSearchPreview = useCallback(
    async (query: string) => {
      const normalizedQuery = query.trim();
      if (normalizedQuery.length < 2) {
        searchRequestIdRef.current += 1;
        setSearchResults([]);
        setIsSearching(false);
        return;
      }
      setSearchFeedback(null);
      await fetchSearchResults(normalizedQuery, 6);
    },
    [fetchSearchResults],
  );

  const handleSearch = useCallback(
    async (query: string) => {
      const normalizedQuery = query.trim();
      if (!normalizedQuery) {
        setSearchFeedback('Enter a ticker or company name to search.');
        return;
      }

      setSearchFeedback('Searching companies...');
      const results = await fetchSearchResults(normalizedQuery, 6);
      const company = getBestValuationSearchResult(results);
      if (!company) {
        setSearchFeedback(`No matching company found for "${normalizedQuery}".`);
        return;
      }
      handleSelectSearchResult(company);
    },
    [fetchSearchResults, handleSelectSearchResult],
  );

  const clearError = useCallback(() => {
    reset();
    setRetryToken((value) => value + 1);
  }, [reset]);

  const { currentValue, histogram, valuationRange } = resolveDisplayedValuationData({
    scenario,
    liveResult: resultForDisplay,
    replaySnapshot: replay,
  });
  const detailsForDisplay = replay && !isDemoMode ? null : resultForDisplay;

  return {
    activeCompanyId,
    activeDrawer,
    activeTicker,
    assumptions,
    closeDrawers,
    clearError,
    currentValue,
    detailsForDisplay,
    error,
    handleAssumptionChange,
    handleSearch,
    handleSearchPreview,
    handleSelectCompany,
    handleSelectRun,
    handleSelectSearchResult,
    histogram,
    isComputing,
    isDemoMode,
    isReplayLoading,
    isRunHistoryLoading,
    isSearching,
    mockDatasets,
    mockPriceHistory,
    openAssumptionsDrawer,
    openLibraryDrawer,
    replayError,
    runHistory,
    runHistoryError: effectiveRunHistoryError,
    scenario,
    searchFeedback,
    searchResults,
    selectedRunId,
    setScenario,
    sensitivityMatrix: replay && !isDemoMode ? undefined : resultForDisplay?.sensitivityMatrix,
    valuationRange,
  };
}
