'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

type CompanySearchResult = {
  _id?: string;
  id?: string;
  symbol?: string;
  ticker?: string;
  name?: string;
};

const getCompanySearchSymbol = (company: CompanySearchResult): string | null => {
  const symbol = company.symbol ?? company.ticker;
  return symbol?.trim() || null;
};

const getCompanySearchId = (company: CompanySearchResult, symbol: string): string =>
  company._id ?? company.id ?? `search:${symbol}`;

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
      scenario,
      assumptions: scenarioAssumptions,
    }).catch(() => {
      // useDcfCompute stores the error for rendering.
    });
  }, [activeTicker, compute, isDemoMode, retryToken, scenario, scenarioAssumptions]);

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

  const handleSearch = useCallback(
    async (query: string) => {
      const normalizedQuery = query.trim();
      if (!normalizedQuery) {
        setSearchFeedback('Enter a ticker or company name to search.');
        return;
      }

      const requestId = searchRequestIdRef.current + 1;
      searchRequestIdRef.current = requestId;
      setSearchFeedback('Searching companies...');

      if (isDemoMode) {
        const normalizedLower = normalizedQuery.toLowerCase();
        const match = Object.values(mockDatasets)
          .flat()
          .find(
            (company) =>
              company.ticker.toLowerCase() === normalizedLower ||
              company.name.toLowerCase().includes(normalizedLower),
          );
        if (!match) {
          setSearchFeedback(`No matching company found for "${normalizedQuery}".`);
          return;
        }
        setSearchFeedback(null);
        selectCompany(match.id, match.ticker);
        return;
      }

      try {
        const response = await fetch(
          `/api/company/search?q=${encodeURIComponent(normalizedQuery)}&limit=1`,
          { method: 'GET' },
        );
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string;
          results?: CompanySearchResult[];
        };
        if (requestId !== searchRequestIdRef.current) {
          return;
        }
        if (!response.ok) {
          throw new Error(payload.message ?? `Search failed (${response.status})`);
        }
        const company = payload.results?.[0];
        if (!company) {
          setSearchFeedback(`No matching company found for "${normalizedQuery}".`);
          return;
        }
        const symbol = getCompanySearchSymbol(company);
        if (!symbol) {
          throw new Error('Search result did not include a ticker symbol.');
        }
        setSearchFeedback(null);
        selectCompany(getCompanySearchId(company, symbol), symbol);
        return;
      } catch (searchError) {
        if (requestId !== searchRequestIdRef.current) {
          return;
        }
        setSearchFeedback(
          searchError instanceof Error ? searchError.message : 'Company search failed.',
        );
      }
    },
    [isDemoMode, selectCompany],
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
    handleSelectCompany,
    handleSelectRun,
    histogram,
    isComputing,
    isDemoMode,
    isReplayLoading,
    isRunHistoryLoading,
    mockDatasets,
    mockPriceHistory,
    openAssumptionsDrawer,
    openLibraryDrawer,
    replayError,
    runHistory,
    runHistoryError: effectiveRunHistoryError,
    scenario,
    searchFeedback,
    selectedRunId,
    setScenario,
    sensitivityMatrix: replay && !isDemoMode ? undefined : resultForDisplay?.sensitivityMatrix,
    valuationRange,
  };
}
