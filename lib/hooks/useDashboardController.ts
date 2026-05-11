'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getBestValuationSearchResult,
  getCompanyCoverageState,
  getCompanySearchId,
  getCompanySearchSymbol,
  type CompanySearchResult,
} from '@/lib/companySearch';
import type {
  ImportedArtifactMetadata,
  ImportReview,
} from '@/lib/contracts/company';
import {
  useCurrentAssumptions,
  useWorkbench,
  type Scenario,
} from '@/lib/contexts/WorkbenchContext';
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
  scenario: Scenario;
  liveResult: DcfResult | null;
  replaySnapshot: ValuationReplaySnapshot | null;
}) {
  if (replaySnapshot) {
    const replayScenario = replaySnapshot.scenario ?? scenario;
    return {
      currentValue: replaySnapshot.scenarios[replayScenario].fairValue,
      displayScenario: replayScenario,
      valuationRange: replaySnapshot.range,
      histogram: replaySnapshot.histogram,
    };
  }

  return {
    currentValue: liveResult?.fairValue ?? null,
    displayScenario: scenario,
    valuationRange: liveResult?.range,
    histogram: liveResult?.histogram,
  };
}

type ImportParseResult = {
  artifacts: ImportedArtifactMetadata[];
  review: ImportReview;
};

type WorkspaceMode = 'valuation' | 'import' | 'detail';

const IMPORT_APPROVAL_TOKEN_STORAGE_KEY = 'dcf-dashboard:import-approval-token';

const readBrowserImportApprovalToken = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return (
      window.sessionStorage.getItem(IMPORT_APPROVAL_TOKEN_STORAGE_KEY)?.trim() ||
      window.localStorage.getItem(IMPORT_APPROVAL_TOKEN_STORAGE_KEY)?.trim() ||
      null
    );
  } catch {
    return null;
  }
};

export const shouldComputeLiveValuation = ({
  isDemoMode,
  selectedRunId,
  workspaceMode,
}: {
  isDemoMode: boolean;
  selectedRunId: string | null | undefined;
  workspaceMode: WorkspaceMode;
}) => !isDemoMode && workspaceMode === 'valuation' && !selectedRunId;

const getDemoResult = (scenario: Scenario): DcfResult => ({
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
    sensitivityMatrix: mockSensitivityMatrix,
    sensitivity: {
      growthOffsets: [-4, -3, -2, -1, 0, 1, 2, 3, 4],
      waccOffsets: [-4, -3, -2, -1, 0, 1, 2, 3, 4],
    },
    projections: mockProjectionRows,
    kpis: mockKpis,
    statementHistory: mockStatementHistory,
    monteCarloSummary: mockMonteCarloSummary,
    provenance: mockProvenance,
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
  const [selectedSearchCompany, setSelectedSearchCompany] = useState<CompanySearchResult | null>(null);
  const [companyDetail, setCompanyDetail] = useState<CompanySearchResult | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('valuation');
  const [importParseResult, setImportParseResult] = useState<ImportParseResult | null>(null);
  const [importStatus, setImportStatus] = useState<'idle' | 'parsing' | 'approving' | 'approved' | 'error'>('idle');
  const [importError, setImportError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const searchRequestIdRef = useRef(0);
  const importParseRequestIdRef = useRef(0);
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
    if (replay?.scenario && replay.scenario !== scenario) {
      setScenario(replay.scenario);
    }
  }, [replay?.scenario, scenario, setScenario]);

  useEffect(() => {
    if (!shouldComputeLiveValuation({ isDemoMode, selectedRunId, workspaceMode })) {
      if (!isDemoMode) {
        reset();
      }
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
  }, [activeCompanyId, activeTicker, compute, isDemoMode, reset, retryToken, scenario, scenarioAssumptions, selectedRunId, workspaceMode]);

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
      setSelectedSearchCompany(null);
      setCompanyDetail(null);
      setWorkspaceMode('valuation');
      importParseRequestIdRef.current += 1;
      setImportParseResult(null);
      setImportStatus('idle');
      setImportError(null);
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
      setSearchFeedback(null);
      setSearchResults([]);
      setSelectedRunId(null);
      importParseRequestIdRef.current += 1;
      setImportParseResult(null);
      setImportStatus('idle');
      setImportError(null);
      setSelectedSearchCompany(company);
      setCompanyDetail(company);
      const coverageState = getCompanyCoverageState(company);
      setWorkspaceMode(
        coverageState === 'import_required'
          ? 'import'
          : coverageState === 'detail_only'
            ? 'detail'
            : 'valuation',
      );
      selectCompany(getCompanySearchId(company, symbol), symbol);
    },
    [selectCompany, setSelectedRunId],
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

  const handleImportParse = useCallback(async (files: File[]) => {
    if (!selectedSearchCompany) {
      return;
    }
    const requestId = importParseRequestIdRef.current + 1;
    importParseRequestIdRef.current = requestId;
    const listingId = selectedSearchCompany.id;
    setImportStatus('parsing');
    setImportError(null);
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    try {
      const response = await fetch(
        `/api/company/import/parse?listingId=${encodeURIComponent(listingId)}`,
        { method: 'POST', body: formData },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
        artifacts?: ImportedArtifactMetadata[];
        review?: ImportReview;
      };
      if (!response.ok || !payload.review || !payload.artifacts) {
        throw new Error(payload.message ?? 'Import parse failed.');
      }
      if (requestId !== importParseRequestIdRef.current) {
        return;
      }
      setImportParseResult({ artifacts: payload.artifacts, review: payload.review });
      setImportStatus('idle');
    } catch (error) {
      if (requestId !== importParseRequestIdRef.current) {
        return;
      }
      setImportStatus('error');
      setImportError(error instanceof Error ? error.message : 'Import parse failed.');
    }
  }, [selectedSearchCompany]);

  const handleApproveImport = useCallback(async (review: ImportReview) => {
    if (!selectedSearchCompany || !importParseResult) {
      return;
    }
    const company = selectedSearchCompany;
    setImportStatus('approving');
    setImportError(null);
    try {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      const approvalToken = readBrowserImportApprovalToken();
      if (approvalToken) {
        headers.set('x-import-approval-token', approvalToken);
      }
      const response = await fetch('/api/company/import/approve/browser', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          company,
          review,
          artifacts: importParseResult.artifacts,
          assumptions: scenarioAssumptions,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? 'Import approval failed.');
      }
      setImportStatus('approved');
      setWorkspaceMode('valuation');
      selectCompany(company.id, getCompanySearchSymbol(company));
      setRetryToken((value) => value + 1);
    } catch (error) {
      setImportStatus('error');
      setImportError(error instanceof Error ? error.message : 'Import approval failed.');
    }
  }, [importParseResult, scenarioAssumptions, selectCompany, selectedSearchCompany]);

  const clearError = useCallback(() => {
    reset();
    setRetryToken((value) => value + 1);
  }, [reset]);

  const { currentValue, displayScenario, histogram, valuationRange } = resolveDisplayedValuationData({
    scenario,
    liveResult: resultForDisplay,
    replaySnapshot: replay,
  });
  const detailsForDisplay = replay && !isDemoMode ? replay : resultForDisplay;
  const isReplayDisplay = replay !== null;
  const valueCardAssumptions =
    replay?.assumptions?.[displayScenario] ?? scenarioAssumptions[displayScenario];

  return {
    activeCompanyId,
    activeDrawer,
    activeTicker,
    assumptions,
    closeDrawers,
    clearError,
    companyDetail,
    currentValue,
    detailsForDisplay,
    displayScenario,
    error,
    handleAssumptionChange,
    handleApproveImport,
    handleImportParse,
    handleSearch,
    handleSearchPreview,
    handleSelectCompany,
    handleSelectRun,
    handleSelectSearchResult,
    histogram,
    isComputing,
    isDemoMode,
    isReplayDisplay,
    isReplayLoading,
    isRunHistoryLoading,
    isSearching,
    importError,
    importParseResult,
    importStatus,
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
    selectedSearchCompany,
    selectedRunId,
    setScenario,
    sensitivityMatrix: replay && !isDemoMode ? replay.sensitivityMatrix : resultForDisplay?.sensitivityMatrix,
    valuationRange,
    workspaceMode,
    valueCardAssumptions,
  };
}
