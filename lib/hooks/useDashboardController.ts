'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useCurrentAssumptions, useWorkbench } from '@/lib/contexts/WorkbenchContext';
import type { Assumptions, Scenario } from '@/lib/workbench/scenarioProfiles';
import type {
  CompanySearchResult,
  CoverageState,
  ImportedArtifactMetadata,
  ImportReview,
  SourceLink,
} from '@/lib/contracts/company';
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

type CoverageFilter = CoverageState | 'all';

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

type ImportParseResult = {
  artifacts: ImportedArtifactMetadata[];
  review: ImportReview;
};

type ConvexImportContext = {
  importedFacts: unknown | null;
  artifacts: unknown[];
};

type SettingsStatus = {
  secUserAgent?: { configured: boolean };
  ai?: { configured: boolean; model?: string | null };
  convex?: {
    configured: boolean;
    syncTokenConfigured: boolean;
    historyReady: boolean;
    importsReady: boolean;
  };
  dataMode?: string;
};

type AiAnalysisStatus = 'idle' | 'loading' | 'applied' | 'error';

export type AiTokenUsage = {
  inputTokens: number;
  estimated: boolean;
  inputBytes: number;
  systemTokens?: number;
  userTokens?: number;
  messageCount?: number;
  model?: string;
  tokenizer?: string;
};

const aiAnalysisProgressMessages = [
  'Packaging current valuation, projections, sensitivity, Monte Carlo, and provenance',
  'Checking approved imports, artifacts, and valuation history from Convex',
  'Sending the valuation context to the configured model',
  'Waiting for strict base, bull, and bear assumptions',
  'Validating bounds, ordering, and material assumption changes',
];

type AiScenarioValue = number | null;

type AiStatementTrends = {
  latestPeriodEnd?: string | null;
  latestRevenueGrowthPct?: number | null;
  revenueCagrPct?: number | null;
  latestOperatingMarginPct?: number | null;
  averageOperatingMarginPct?: number | null;
  latestCashToRevenuePct?: number | null;
  latestDebtToRevenuePct?: number | null;
  latestNetDebtToRevenuePct?: number | null;
  periodsCovered: string[];
};

export type AiValuationContext = {
  task: 'dcf_scenario_assumptions';
  company: {
    id: string | null;
    symbol: string;
    name?: string | null;
    exchangeMic?: string | null;
    market?: string | null;
    country?: string | null;
    currency?: string | null;
    coverageState?: CoverageState;
    coverageReason?: string | null;
    sourceLinks: SourceLink[];
  };
  activeScenario: 'base' | 'bull' | 'bear';
  displayCurrency: string;
  currentAssumptions: Record<Scenario, Assumptions>;
  valuation: {
    activeFairValue: number | null;
    range?: [number, number];
    scenarios: Record<'base' | 'bull' | 'bear', AiScenarioValue>;
  } | null;
  financials: {
    kpis: DcfResult['kpis'];
    statementHistory: DcfResult['statementHistory'];
    statementTrends: AiStatementTrends;
    projections: DcfResult['projections'];
  };
  sensitivity?: {
    growthOffsets?: number[];
    waccOffsets?: number[];
    values?: number[][];
  };
  monteCarlo?: {
    summary?: DcfResult['monteCarloSummary'];
    histogram?: DcfResult['histogram'];
  };
  provenance?: DcfResult['provenance'];
  replay?: {
    runId: string;
    createdAt?: number;
  };
  convex?: {
    importedFacts?: unknown | null;
    importArtifacts?: unknown[];
    historyReadsEnabled: boolean;
  };
  instructions: {
    output: 'strict_base_bull_bear_json';
    useContext: string[];
    avoid: string[];
  };
};

const getCompanySearchSymbol = (company: CompanySearchResult): string | null => {
  const symbol = company.symbol;
  return symbol?.trim() || null;
};

const getCompanySearchId = (company: CompanySearchResult, symbol: string): string =>
  company.id ?? `search:${symbol}`;

const finiteOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const rateToPercent = (value: number | null | undefined): number | null => {
  const finite = finiteOrNull(value);
  if (finite === null) {
    return null;
  }
  return Math.abs(finite) <= 1 ? finite * 100 : finite;
};

const roundPercent = (value: number | null): number | null =>
  value === null ? null : Math.round(value * 100) / 100;

const buildStatementTrends = (
  history: DcfResult['statementHistory'] | ValuationReplaySnapshot['statementHistory'] | undefined,
): AiStatementTrends => {
  const ordered = [...(history ?? [])].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
  const latest = ordered[0];
  const previous = ordered[1];
  const latestRevenueGrowthPct =
    latest?.revenue && previous?.revenue
      ? ((latest.revenue - previous.revenue) / previous.revenue) * 100
      : null;
  const oldest = ordered[ordered.length - 1];
  const latestYear = latest ? Number(latest.periodEnd.slice(0, 4)) : null;
  const oldestYear = oldest ? Number(oldest.periodEnd.slice(0, 4)) : null;
  const yearSpan =
    Number.isFinite(latestYear) && Number.isFinite(oldestYear)
      ? Number(latestYear) - Number(oldestYear)
      : 0;
  const revenueCagrPct =
    latest?.revenue && oldest?.revenue && yearSpan > 0
      ? (((latest.revenue / oldest.revenue) ** (1 / yearSpan)) - 1) * 100
      : null;
  const operatingMarginPct = (point: (typeof ordered)[number] | undefined): number | null => {
    if (!point) {
      return null;
    }
    const margin =
      rateToPercent(point.operatingMargin) ??
      (point.operatingIncome !== null &&
      point.operatingIncome !== undefined &&
      point.revenue
        ? (point.operatingIncome / point.revenue) * 100
        : null);
    return margin;
  };
  const operatingMargins = ordered.flatMap((point) => {
    const margin = operatingMarginPct(point);
    return margin === null ? [] : [margin];
  });

  return {
    latestPeriodEnd: latest?.periodEnd ?? null,
    latestRevenueGrowthPct: roundPercent(latestRevenueGrowthPct),
    revenueCagrPct: roundPercent(revenueCagrPct),
    latestOperatingMarginPct: roundPercent(operatingMarginPct(latest)),
    averageOperatingMarginPct: roundPercent(
      operatingMargins.length > 0
        ? operatingMargins.reduce((sum, value) => sum + value, 0) / operatingMargins.length
        : null,
    ),
    latestCashToRevenuePct: roundPercent(
      latest?.cash !== null && latest?.cash !== undefined && latest.revenue
        ? (latest.cash / latest.revenue) * 100
        : null,
    ),
    latestDebtToRevenuePct: roundPercent(
      latest?.debt !== null && latest?.debt !== undefined && latest.revenue
        ? (latest.debt / latest.revenue) * 100
        : null,
    ),
    latestNetDebtToRevenuePct: roundPercent(
      latest?.cash !== null &&
        latest?.cash !== undefined &&
        latest?.debt !== null &&
        latest?.debt !== undefined &&
        latest.revenue
        ? ((latest.debt - latest.cash) / latest.revenue) * 100
        : null,
    ),
    periodsCovered: ordered.map((point) => point.periodEnd),
  };
};

const readScenarioValueForAi = (
  scenarios: DcfResult['scenarios'] | ValuationReplaySnapshot['scenarios'] | undefined,
  scenarioName: 'base' | 'bull' | 'bear',
): AiScenarioValue => {
  const value = scenarios?.[scenarioName];
  if (typeof value === 'number' || value === null) {
    return finiteOrNull(value);
  }
  return finiteOrNull(value?.fairValue);
};

const mergeSourceLinks = (
  selectedCompany: CompanySearchResult | null,
  companyDetail: CompanySearchResult | null,
): SourceLink[] => {
  const links = [...(selectedCompany?.sourceLinks ?? []), ...(companyDetail?.sourceLinks ?? [])];
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = `${link.title}:${link.url}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export const buildAiValuationContext = ({
  activeCompanyId,
  activeTicker,
  companyDetail,
  displayCurrency,
  result,
  scenario,
  scenarioAssumptions,
  selectedSearchCompany,
  convexImportContext,
  historyReadsEnabled,
}: {
  activeCompanyId: string | null;
  activeTicker: string;
  companyDetail: CompanySearchResult | null;
  convexImportContext: ConvexImportContext | null;
  displayCurrency: string;
  historyReadsEnabled: boolean;
  result: DcfResult | ValuationReplaySnapshot | null;
  scenario: 'base' | 'bull' | 'bear';
  scenarioAssumptions: Record<Scenario, Assumptions>;
  selectedSearchCompany: CompanySearchResult | null;
}): AiValuationContext => {
  const company = companyDetail ?? selectedSearchCompany;
  const activeFairValue =
    'fairValue' in (result ?? {})
      ? finiteOrNull((result as DcfResult | null)?.fairValue)
      : readScenarioValueForAi(result?.scenarios, scenario);

  return {
    task: 'dcf_scenario_assumptions',
    company: {
      id: activeCompanyId,
      symbol: company?.symbol ?? activeTicker,
      name: company?.name ?? result?.provenance?.name,
      exchangeMic: company?.exchangeMic ?? null,
      market: company?.market ?? null,
      country: company?.country ?? null,
      currency: company?.currency ?? result?.provenance?.currency ?? displayCurrency,
      coverageState: company?.coverageState,
      coverageReason: company?.coverageReason ?? null,
      sourceLinks: mergeSourceLinks(selectedSearchCompany, companyDetail),
    },
    activeScenario: scenario,
    displayCurrency,
    currentAssumptions: scenarioAssumptions,
    valuation: result
      ? {
          activeFairValue,
          range: result.range,
          scenarios: {
            base: readScenarioValueForAi(result.scenarios, 'base'),
            bull: readScenarioValueForAi(result.scenarios, 'bull'),
            bear: readScenarioValueForAi(result.scenarios, 'bear'),
          },
        }
      : null,
    financials: {
      kpis: result?.kpis ?? [],
      statementHistory: result?.statementHistory ?? [],
      statementTrends: buildStatementTrends(result?.statementHistory),
      projections: result?.projections ?? [],
    },
    sensitivity: result
      ? {
          growthOffsets: result.sensitivity?.growthOffsets,
          waccOffsets: result.sensitivity?.waccOffsets,
          values: result.sensitivityMatrix,
        }
      : undefined,
    monteCarlo: result
      ? {
          summary: result.monteCarloSummary,
          histogram: result.histogram,
        }
      : undefined,
    provenance: result?.provenance,
    replay: result && 'runId' in result ? { runId: result.runId, createdAt: result.createdAt } : undefined,
    convex: {
      importedFacts: convexImportContext?.importedFacts ?? null,
      importArtifacts: convexImportContext?.artifacts ?? [],
      historyReadsEnabled,
    },
    instructions: {
      output: 'strict_base_bull_bear_json',
      useContext: [
        'company identity, market, country, currency, and official source links',
        'current base, bull, and bear assumptions only as dashboard state for no-op avoidance',
        'latest fair value, scenario values, valuation range, and display currency',
        'historical statement facts and KPI trends',
        'forecast projections and free cash flow path',
        'sensitivity offsets/matrix and Monte Carlo distribution summary',
        'filing provenance and latest reporting dates',
        'approved Convex imported facts and artifacts when present',
        'Convex valuation replay data when a saved run is selected',
      ],
      avoid: [
        'inventing facts not present in the context',
        'using market commentary that conflicts with filing provenance',
        'returning markdown, prose outside JSON, or chain-of-thought',
      ],
    },
  };
};

const getDemoResult = (scenario: 'base' | 'bull' | 'bear'): DcfResult => ({
  fairValue: scenarioValues[scenario],
  range: fallbackRange,
  histogram: mockHistogram,
  scenarios: scenarioValues,
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
    setScenarioAssumptions,
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
  const [selectedSearchCompany, setSelectedSearchCompany] = useState<CompanySearchResult | null>(null);
  const [companyDetail, setCompanyDetail] = useState<CompanySearchResult | null>(null);
  const [coverageFilter, setCoverageFilter] = useState<CoverageFilter>('all');
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('valuation');
  const [importParseResult, setImportParseResult] = useState<ImportParseResult | null>(null);
  const [convexImportContext, setConvexImportContext] = useState<ConvexImportContext | null>(null);
  const [importStatus, setImportStatus] = useState<'idle' | 'parsing' | 'approving' | 'approved' | 'error'>('idle');
  const [importError, setImportError] = useState<string | null>(null);
  const [settingsStatus, setSettingsStatus] = useState<SettingsStatus | null>(null);
  const [recentCompanies, setRecentCompanies] = useState<CompanySearchResult[]>([]);
  const [aiAnalysisStatus, setAiAnalysisStatus] = useState<AiAnalysisStatus>('idle');
  const [aiRationales, setAiRationales] = useState<Partial<Record<'base' | 'bull' | 'bear', string>>>({});
  const [aiAnalysisStream, setAiAnalysisStream] = useState<string[]>([]);
  const [aiTokenUsage, setAiTokenUsage] = useState<AiTokenUsage | null>(null);
  const [aiAdminModeEnabled, setAiAdminModeEnabled] = useState(false);
  const [aiAdminToken, setAiAdminToken] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const searchRequestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);
  const importParseRequestIdRef = useRef(0);
  const aiAnalysisRequestIdRef = useRef(0);
  const didBootstrapUrlSearchRef = useRef(false);
  const isDemoMode = getDashboardDataMode() === 'demo';
  const shouldLoadBrowserHistory = !isDemoMode && areBrowserHistoryReadsEnabled();

  const activeCompany = isDemoMode ? resolveActiveCompany(mockDatasets, selectedCompanyId) : null;
  const activeCompanyId = activeCompany?.id ?? selectedCompanyId ?? null;
  const activeTicker = activeCompany?.ticker ?? selectedSymbol ?? 'AAPL';
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
  const activeContextRef = useRef({
    activeCompanyId,
    activeTicker,
    workspaceMode,
    resultForDisplay,
  });
  activeContextRef.current = {
    activeCompanyId,
    activeTicker,
    workspaceMode,
    resultForDisplay,
  };
  const displayCurrency =
    selectedSearchCompany?.currency ??
    replay?.provenance?.currency ??
    resultForDisplay?.provenance.currency ??
    'USD';
  const runHistory = isDemoMode
    ? mockRunHistory.filter((run) => run.ticker === activeTicker)
    : liveRunHistory;
  const effectiveRunHistoryError =
    isDemoMode || shouldLoadBrowserHistory
      ? runHistoryError
      : new Error('Recent runs are unavailable in this environment.');

  useEffect(() => {
    if (!isDemoMode && replayError && selectedRunId && replayRunId === selectedRunId) {
      setSelectedRunId(null);
    }
  }, [isDemoMode, replayError, replayRunId, selectedRunId, setSelectedRunId]);

  useEffect(() => {
    if (isDemoMode) {
      setConvexImportContext(null);
      return;
    }
    const symbol = selectedSearchCompany?.symbol ?? activeTicker;
    const listingId = selectedSearchCompany?.id ?? activeCompanyId;
    if (!symbol && !listingId) {
      setConvexImportContext(null);
      return;
    }

    setConvexImportContext(null);
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (listingId) {
      params.set('listingId', listingId);
    }
    if (symbol) {
      params.set('symbol', symbol);
    }

    void fetch(`/api/company/import/context?${params.toString()}`, {
      method: 'GET',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }
        return response.json() as Promise<ConvexImportContext>;
      })
      .then((context) => {
        if (!controller.signal.aborted) {
          setConvexImportContext(context);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setConvexImportContext(null);
        }
      });

    return () => {
      controller.abort();
    };
  }, [activeCompanyId, activeTicker, isDemoMode, selectedSearchCompany]);

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
  }, [
    activeCompanyId,
    activeTicker,
    compute,
    isDemoMode,
    reset,
    retryToken,
    scenario,
    scenarioAssumptions,
    selectedRunId,
    workspaceMode,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const raw = window.localStorage.getItem('dcf-dashboard:recent-companies');
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        setRecentCompanies(parsed.filter((item): item is CompanySearchResult => {
          return Boolean(item && typeof item === 'object' && 'id' in item && 'symbol' in item);
        }).slice(0, 8));
      }
    } catch {
      setRecentCompanies([]);
    }
  }, []);

  useEffect(() => {
    if (isDemoMode) {
      return;
    }
    void fetch('/api/settings/status')
      .then(async (response) => (response.ok ? response.json() : null))
      .then((payload: SettingsStatus | null) => setSettingsStatus(payload))
      .catch(() => setSettingsStatus(null));
  }, [isDemoMode]);

  const rememberCompany = useCallback((company: CompanySearchResult) => {
    setRecentCompanies((current) => {
      const next = [company, ...current.filter((item) => item.id !== company.id)].slice(0, 8);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('dcf-dashboard:recent-companies', JSON.stringify(next));
      }
      return next;
    });
  }, []);

  const resetAiAnalysisState = useCallback(() => {
    aiAnalysisRequestIdRef.current += 1;
    setAiAnalysisStatus('idle');
    setAiRationales({});
    setAiAnalysisStream([]);
    setAiTokenUsage(null);
  }, []);

  const handleAssumptionChange = useCallback(
    (key: Extract<keyof typeof assumptions, string>, value: number) => {
      setSelectedRunId(null);
      resetAiAnalysisState();
      updateAssumption(key, value);
    },
    [resetAiAnalysisState, setSelectedRunId, updateAssumption],
  );

  const handleSelectCompany = useCallback(
    (id: string, source: RailVariant) => {
      const company = isDemoMode ? resolveActiveCompany(mockDatasets, id) : null;
      const recent = recentCompanies.find((item) => item.id === id) ?? null;
      if (!isDemoMode && recent) {
        const detailRequestId = detailRequestIdRef.current + 1;
        detailRequestIdRef.current = detailRequestId;
        importParseRequestIdRef.current += 1;
        resetAiAnalysisState();
        setImportParseResult(null);
        setImportStatus('idle');
        setImportError(null);
        void (async () => {
          let selected = recent;
          try {
            const response = await fetch(`/api/company/detail?id=${encodeURIComponent(recent.id)}`);
            const detail = (await response.json().catch(() => null)) as CompanySearchResult | null;
            if (response.ok && detail && detailRequestId === detailRequestIdRef.current && detail.id === recent.id) {
              selected = detail;
              rememberCompany(detail);
            }
          } catch {
            // Fall back to the locally remembered company if detail refresh fails.
          }
          if (detailRequestId !== detailRequestIdRef.current) {
            return;
          }
          const symbol = getCompanySearchSymbol(selected);
          setSearchFeedback(null);
          setSelectedRunId(null);
          setSelectedSearchCompany(selected);
          setCompanyDetail(selected);
          setWorkspaceMode(
            selected.coverageState === 'import_required'
              ? 'import'
              : selected.coverageState === 'detail_only'
                ? 'detail'
                : 'valuation',
          );
          selectCompany(getCompanySearchId(selected, symbol ?? selected.symbol), symbol);
          onCompanySelected(source);
        })();
        return;
      }
      setSearchFeedback(null);
      setSelectedRunId(null);
      importParseRequestIdRef.current += 1;
      resetAiAnalysisState();
      setImportParseResult(null);
      setImportStatus('idle');
      setImportError(null);
      setSelectedSearchCompany(recent);
      setCompanyDetail(recent);
      setWorkspaceMode(recent?.coverageState === 'import_required' ? 'import' : recent?.coverageState === 'detail_only' ? 'detail' : 'valuation');
      selectCompany(company?.id ?? recent?.id ?? id, company?.ticker ?? recent?.symbol ?? null);
      onCompanySelected(source);
    },
    [isDemoMode, onCompanySelected, recentCompanies, rememberCompany, resetAiAnalysisState, selectCompany, setSelectedRunId],
  );

  const handleSelectRun = useCallback(
    (id: string, source: RailVariant) => {
      aiAnalysisRequestIdRef.current += 1;
      resetAiAnalysisState();
      setSelectedRunId(id);
      onRunSelected(source);
    },
    [onRunSelected, resetAiAnalysisState, setSelectedRunId],
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
        const normalizedLower = normalizedQuery.toLowerCase();
        const results = Object.values(mockDatasets)
          .flat()
          .filter(
            (company) =>
              company.ticker.toLowerCase().includes(normalizedLower) ||
              company.name.toLowerCase().includes(normalizedLower),
          )
          .slice(0, limit)
          .map((company) => ({
            id: company.id,
            symbol: company.ticker,
            name: company.name,
            exchangeMic: 'XNAS',
            market: 'Nasdaq',
            country: 'US',
            currency: 'USD',
            coverageState: 'valuation_ready' as const,
            coverageReason: 'Valuation-ready from the demo catalog.',
            sourceLinks: [],
          }));
        if (requestId === searchRequestIdRef.current) {
          setSearchResults(results);
          setIsSearching(false);
        }
        return results;
      }

      try {
        const response = await fetch(
          `/api/company/search?q=${encodeURIComponent(normalizedQuery)}&limit=10`,
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
      resetAiAnalysisState();
      setImportParseResult(null);
      setImportStatus('idle');
      setImportError(null);
      setSelectedSearchCompany(company);
      setCompanyDetail(company);
      rememberCompany(company);
      selectCompany(getCompanySearchId(company, symbol), symbol);
      if (company.coverageState === 'valuation_ready') {
        setWorkspaceMode('valuation');
      } else if (company.coverageState === 'import_required') {
        setWorkspaceMode('import');
      } else {
        setWorkspaceMode('detail');
      }
      const detailRequestId = detailRequestIdRef.current + 1;
      detailRequestIdRef.current = detailRequestId;
      void fetch(`/api/company/detail?id=${encodeURIComponent(company.id)}`)
        .then(async (detailResponse) => (detailResponse.ok ? detailResponse.json() : null))
        .then((detail: CompanySearchResult | null) => {
          if (detailRequestId === detailRequestIdRef.current && detail?.id === company.id) {
            setCompanyDetail(detail);
          }
        })
        .catch(() => undefined);
    },
    [rememberCompany, resetAiAnalysisState, selectCompany, setSelectedRunId],
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
      const candidates = await fetchSearchResults(normalizedQuery, 10);
      const company =
        coverageFilter === 'all'
          ? candidates.find((item) => item.coverageState === 'valuation_ready') ?? candidates[0]
          : candidates.find((item) => item.coverageState === coverageFilter);
      if (!company) {
        setSearchFeedback(`No matching company found for "${normalizedQuery}".`);
        return;
      }
      handleSelectSearchResult(company);
    },
    [coverageFilter, fetchSearchResults, handleSelectSearchResult],
  );

  useEffect(() => {
    if (didBootstrapUrlSearchRef.current || typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const initialQuery = params.get('company-search')?.trim() ?? params.get('symbol')?.trim();
    if (!initialQuery) {
      return;
    }

    didBootstrapUrlSearchRef.current = true;
    params.delete('company-search');
    const nextSearch = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`,
    );
    void handleSearch(initialQuery);
  }, [handleSearch]);

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
      if (
        requestId !== importParseRequestIdRef.current ||
        activeContextRef.current.activeCompanyId !== listingId
      ) {
        return;
      }
      setImportParseResult({ artifacts: payload.artifacts, review: payload.review });
      setImportStatus('idle');
    } catch (error) {
      if (
        requestId !== importParseRequestIdRef.current ||
        activeContextRef.current.activeCompanyId !== listingId
      ) {
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
    const requestCompany = selectedSearchCompany;
    const requestCompanyId = requestCompany.id;
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
          company: requestCompany,
          review,
          artifacts: importParseResult.artifacts,
          assumptions: scenarioAssumptions,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
        result?: unknown;
        importedFacts?: { statements?: unknown[] };
      };
      if (!response.ok || !payload.result) {
        throw new Error(payload.message ?? 'Import approval failed.');
      }
      if (activeContextRef.current.activeCompanyId !== requestCompanyId) {
        return;
      }
      reset();
      setWorkspaceMode('valuation');
      setImportStatus('approved');
      setRetryToken((value) => value + 1);
      selectCompany(requestCompany.id, requestCompany.symbol);
    } catch (error) {
      if (activeContextRef.current.activeCompanyId !== requestCompanyId) {
        return;
      }
      setImportStatus('error');
      setImportError(error instanceof Error ? error.message : 'Import approval failed.');
    }
  }, [
    importParseResult,
    reset,
    scenarioAssumptions,
    selectCompany,
    selectedSearchCompany,
  ]);

  const handleApplyAiAnalysis = useCallback(async () => {
    const currentResult = replay && !isDemoMode ? replay : resultForDisplay;
    const resultSymbol =
      currentResult?.provenance?.symbol?.trim().toUpperCase() ??
      (replay && !isDemoMode ? replay.ticker?.trim().toUpperCase() : null);
    if (
      workspaceMode !== 'valuation' ||
      isComputing ||
      !currentResult ||
      (!replay && resultSymbol !== activeTicker.trim().toUpperCase())
    ) {
      setAiAnalysisStatus('error');
      setAiAnalysisStream(['AI analysis needs the current valuation to finish first']);
      return;
    }
    const requestId = aiAnalysisRequestIdRef.current + 1;
    aiAnalysisRequestIdRef.current = requestId;
    const requestCompanyId = activeCompanyId;
    const requestTicker = activeTicker;
    setAiAnalysisStatus('loading');
    setAiRationales({});
    setAiTokenUsage(null);
    setAiAnalysisStream([aiAnalysisProgressMessages[0]]);
    let progressIndex = 1;
    const progressTimer = window.setInterval(() => {
      if (progressIndex >= aiAnalysisProgressMessages.length) {
        return;
      }
      const nextMessage = aiAnalysisProgressMessages[progressIndex];
      progressIndex += 1;
      setAiAnalysisStream((current) =>
        current.includes(nextMessage) ? current : [...current, nextMessage],
      );
    }, 4000);
    try {
      const adminToken =
        typeof window === 'undefined'
          ? null
          : aiAdminToken;
      const aiScenario = replay && !isDemoMode ? (replay.scenario ?? scenario) : scenario;
      const valuationContext = buildAiValuationContext({
        activeCompanyId,
        activeTicker,
        companyDetail,
        convexImportContext,
        displayCurrency,
        historyReadsEnabled: shouldLoadBrowserHistory,
        result: currentResult,
        scenario: aiScenario,
        scenarioAssumptions,
        selectedSearchCompany,
      });
      const response = await fetch('/api/ai/scenario-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(adminToken ? { 'x-dcf-admin-token': adminToken } : {}),
        },
        body: JSON.stringify(valuationContext),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
        analysis?: Record<'base' | 'bull' | 'bear', typeof assumptions & { rationale: string }>;
        tokenUsage?: AiTokenUsage;
      };
      if (!response.ok || !payload.analysis) {
        throw new Error(payload.message ?? 'AI analysis failed.');
      }
      if (
        requestId !== aiAnalysisRequestIdRef.current ||
        activeContextRef.current.activeCompanyId !== requestCompanyId ||
        activeContextRef.current.activeTicker !== requestTicker ||
        activeContextRef.current.workspaceMode !== 'valuation'
      ) {
        return;
      }
      setAiAnalysisStream((current) => [...current, 'Applying assumptions and triggering recompute']);
      const stripRationale = (values: typeof assumptions & { rationale: string }) => ({
        revenueGrowth: values.revenueGrowth,
        operatingMargin: values.operatingMargin,
        discountRate: values.discountRate,
        terminalGrowth: values.terminalGrowth,
      });
      setScenarioAssumptions({
        base: stripRationale(payload.analysis.base),
        bull: stripRationale(payload.analysis.bull),
        bear: stripRationale(payload.analysis.bear),
      });
      setAiRationales({
        base: payload.analysis.base.rationale,
        bull: payload.analysis.bull.rationale,
        bear: payload.analysis.bear.rationale,
      });
      setAiTokenUsage(payload.tokenUsage ?? null);
      setSelectedRunId(null);
      setAiAnalysisStatus('applied');
      setAiAnalysisStream((current) => [...current, 'Analysis applied']);
    } catch {
      if (requestId !== aiAnalysisRequestIdRef.current) {
        return;
      }
      setAiAnalysisStream((current) => [...current, 'The model response could not be applied']);
      setAiTokenUsage(null);
      setAiAnalysisStatus('error');
    } finally {
      window.clearInterval(progressTimer);
    }
  }, [
    activeCompanyId,
    activeTicker,
    aiAdminToken,
    companyDetail,
    convexImportContext,
    displayCurrency,
    isDemoMode,
    isComputing,
    replay,
    resultForDisplay,
    scenario,
    scenarioAssumptions,
    selectedSearchCompany,
    setScenarioAssumptions,
    setSelectedRunId,
    shouldLoadBrowserHistory,
    workspaceMode,
  ]);

  const handleAiAdminTokenChange = useCallback((token: string) => {
    const trimmed = token.trim();
    if (!trimmed) {
      setAiAdminToken(null);
      setAiAdminModeEnabled(false);
      return;
    }

    setAiAdminToken(trimmed);
    setAiAdminModeEnabled(true);
  }, []);

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
    aiAnalysisStream,
    aiAnalysisStatus,
    aiAdminModeEnabled,
    aiRationales,
    aiTokenUsage,
    assumptions,
    closeDrawers,
    companyDetail,
    clearError,
    coverageFilter,
    currentValue,
    detailsForDisplay,
    displayCurrency,
    displayScenario,
    error,
    handleAssumptionChange,
    handleApplyAiAnalysis,
    handleAiAdminTokenChange,
    handleApproveImport,
    handleImportParse,
    handleSearch,
    handleSearchPreview,
    handleSelectCompany,
    handleSelectRun,
    handleSelectSearchResult,
    histogram,
    importError,
    importParseResult,
    importStatus,
    isComputing,
    isDemoMode,
    isReplayDisplay,
    isReplayLoading,
    isRunHistoryLoading,
    isSearching,
    mockDatasets,
    mockPriceHistory,
    openAssumptionsDrawer,
    openLibraryDrawer,
    replayError,
    recentCompanies,
    runHistory,
    runHistoryError: effectiveRunHistoryError,
    scenario,
    searchFeedback,
    searchResults,
    selectedSearchCompany,
    selectedRunId,
    setScenario,
    setCoverageFilter,
    settingsStatus,
    sensitivityMatrix: replay && !isDemoMode ? replay.sensitivityMatrix : resultForDisplay?.sensitivityMatrix,
    valuationRange,
    valueCardAssumptions,
    workspaceMode,
  };
}
