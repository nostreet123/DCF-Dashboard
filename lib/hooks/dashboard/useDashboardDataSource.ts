'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  areBrowserHistoryReadsEnabled,
  getDashboardDataMode,
} from '@/lib/dashboardDataMode';
import { readBrowserImportContextToken } from '@/lib/browserImportTokens';
import type { ConvexImportContext } from '@/lib/ai/valuationContext';
import type { SettingsStatus, WorkspaceMode } from '@/lib/dashboard/viewModel';
import type { CompanySearchResult } from '@/lib/contracts/company';
import type { Assumptions, Scenario } from '@/lib/workbench/scenarioProfiles';
import type { DcfResult } from '@/lib/hooks/useDcfCompute';
import { useDcfCompute } from '@/lib/hooks/useDcfCompute';
import { useValuationHistory, useValuationReplay } from '@/lib/hooks/useValuationHistory';
import type { ValuationReplaySnapshot } from '@/lib/hooks/useValuationHistory';
import { resolveActiveCompany } from '@/lib/hooks/useWorkbenchViewState';
import {
  fallbackRange,
  mockDatasets,
  mockHistogram,
  mockKpis,
  mockMonteCarloSummary,
  mockProjectionRows,
  mockProvenance,
  mockRunHistory,
  mockSensitivityMatrix,
  mockStatementHistory,
  scenarioValues,
} from '@/lib/workbench/mockData';
import { shouldComputeLiveValuation } from '@/lib/hooks/dashboard/useDashboardDisplayState';

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

const getDemoReplay = (runId: string | undefined | null): ValuationReplaySnapshot | null => {
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

export function useDashboardDataSource({
  scenario,
  scenarioAssumptions,
  selectedCompanyId,
  selectedSymbol,
  selectedRunId,
  setSelectedRunId,
  workspaceMode,
  selectedSearchCompany,
  retryToken,
  setRetryToken,
  aiAdminToken,
}: {
  scenario: Scenario;
  scenarioAssumptions: Record<Scenario, Assumptions>;
  selectedCompanyId: string | null;
  selectedSymbol: string | null;
  selectedRunId: string | null;
  setSelectedRunId: (runId: string | null) => void;
  workspaceMode: WorkspaceMode;
  selectedSearchCompany: CompanySearchResult | null;
  retryToken: number;
  setRetryToken: (updater: (value: number) => number) => void;
  aiAdminToken: string | null;
}) {
  const {
    compute,
    reset,
    result,
    isLoading: isComputing,
    error,
  } = useDcfCompute();

  const [settingsStatus, setSettingsStatus] = useState<SettingsStatus | null>(null);
  const [convexImportContext, setConvexImportContext] = useState<ConvexImportContext | null>(null);

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
    if (isDemoMode || !shouldLoadBrowserHistory) {
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

    const importContextToken = readBrowserImportContextToken();
    void fetch(`/api/company/import/context/browser?${params.toString()}`, {
      method: 'GET',
      signal: controller.signal,
      headers: importContextToken
        ? { 'x-import-context-token': importContextToken }
        : undefined,
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
  }, [activeCompanyId, activeTicker, isDemoMode, selectedSearchCompany, shouldLoadBrowserHistory]);

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
    if (isDemoMode || !aiAdminToken?.trim()) {
      setSettingsStatus(null);
      return;
    }
    const controller = new AbortController();
    void fetch('/api/settings/status', {
      headers: { 'x-dcf-admin-token': aiAdminToken },
      signal: controller.signal,
    })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((payload: SettingsStatus | null) => setSettingsStatus(payload))
      .catch(() => setSettingsStatus(null));
    return () => controller.abort();
  }, [aiAdminToken, isDemoMode]);

  const clearError = useCallback(() => {
    reset();
    setRetryToken((value) => value + 1);
  }, [reset, setRetryToken]);

  return {
    isDemoMode,
    shouldLoadBrowserHistory,
    activeCompanyId,
    activeTicker,
    resultForDisplay,
    replay,
    displayCurrency,
    runHistory,
    effectiveRunHistoryError,
    isRunHistoryLoading,
    isReplayLoading,
    replayError,
    isComputing,
    error,
    settingsStatus,
    convexImportContext,
    reset,
    clearError,
  };
}
