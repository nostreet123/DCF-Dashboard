'use client';

import { useCallback, useRef, useState } from 'react';
import { useCurrentAssumptions, useWorkbench } from '@/lib/contexts/WorkbenchContext';
import { getDashboardDataMode } from '@/lib/dashboardDataMode';
import type { DashboardViewModel } from '@/lib/dashboard/viewModel';
import { useAiScenarioAnalysis } from '@/lib/hooks/dashboard/useAiScenarioAnalysis';
import { useCompanyDiscovery } from '@/lib/hooks/dashboard/useCompanyDiscovery';
import { useDashboardDataSource } from '@/lib/hooks/dashboard/useDashboardDataSource';
import { useDashboardDisplayState } from '@/lib/hooks/dashboard/useDashboardDisplayState';
import { useImportWorkflow } from '@/lib/hooks/dashboard/useImportWorkflow';
import { useWorkbenchViewState, type RailVariant } from '@/lib/hooks/useWorkbenchViewState';
import { mockDatasets, mockPriceHistory } from '@/lib/workbench/mockData';

export {
  resolveDisplayedValuationData,
  shouldComputeLiveValuation,
} from '@/lib/hooks/dashboard/useDashboardDisplayState';

export {
  AI_ANALYSIS_PROGRESS_STEP_COUNT,
  buildAiValuationContext,
  type AiTokenUsage,
  type AiValuationContext,
} from '@/lib/ai/valuationContext';

export type { DashboardViewModel } from '@/lib/dashboard/viewModel';

export function useDashboardController(): DashboardViewModel {
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

  const [retryToken, setRetryToken] = useState(0);
  const [aiAdminToken, setAiAdminToken] = useState<string | null>(null);
  const [aiAdminModeEnabled, setAiAdminModeEnabled] = useState(false);
  const resetWorkflowRef = useRef<() => void>(() => undefined);
  const isDemoMode = getDashboardDataMode() === 'demo';

  const discovery = useCompanyDiscovery({
    isDemoMode,
    selectCompany,
    setSelectedRunId,
    onCompanySelected,
    onCompanyChange: () => resetWorkflowRef.current(),
  });

  const dataSource = useDashboardDataSource({
    scenario,
    scenarioAssumptions,
    selectedCompanyId,
    selectedSymbol,
    selectedRunId,
    setSelectedRunId,
    workspaceMode: discovery.workspaceMode,
    selectedSearchCompany: discovery.selectedSearchCompany,
    retryToken,
    setRetryToken,
    aiAdminToken,
  });

  const importWorkflow = useImportWorkflow({
    selectedSearchCompany: discovery.selectedSearchCompany,
    activeCompanyId: dataSource.activeCompanyId,
    scenarioAssumptions,
    reset: dataSource.reset,
    selectCompany,
    setWorkspaceMode: discovery.setWorkspaceMode,
    setRetryToken,
    onImportReset: () => undefined,
  });

  const ai = useAiScenarioAnalysis({
    activeCompanyId: dataSource.activeCompanyId,
    activeTicker: dataSource.activeTicker,
    companyDetail: discovery.companyDetail,
    convexImportContext: dataSource.convexImportContext,
    displayCurrency: dataSource.displayCurrency,
    isDemoMode: dataSource.isDemoMode,
    isComputing: dataSource.isComputing,
    replay: dataSource.replay,
    resultForDisplay: dataSource.resultForDisplay,
    scenario,
    scenarioAssumptions,
    selectedSearchCompany: discovery.selectedSearchCompany,
    setScenario,
    setScenarioAssumptions,
    setSelectedRunId,
    shouldLoadBrowserHistory: dataSource.shouldLoadBrowserHistory,
    workspaceMode: discovery.workspaceMode,
    assumptions,
    aiAdminToken,
    aiAdminModeEnabled,
    setAiAdminToken,
    setAiAdminModeEnabled,
  });

  resetWorkflowRef.current = () => {
    importWorkflow.resetImportState();
    ai.resetAiAnalysisState();
  };

  const display = useDashboardDisplayState({
    scenario,
    scenarioAssumptions,
    resultForDisplay: dataSource.resultForDisplay,
    replay: dataSource.replay,
    isDemoMode: dataSource.isDemoMode,
  });

  const handleAssumptionChange = useCallback(
    (key: Extract<keyof typeof assumptions, string>, value: number) => {
      setSelectedRunId(null);
      ai.resetAiAnalysisState();
      updateAssumption(key, value);
    },
    [ai, setSelectedRunId, updateAssumption],
  );

  const handleSelectRun = useCallback(
    (id: string, source: RailVariant) => {
      ai.resetAiAnalysisState();
      setSelectedRunId(id);
      onRunSelected(source);
    },
    [ai, onRunSelected, setSelectedRunId],
  );

  return {
    company: {
      activeCompanyId: dataSource.activeCompanyId,
      activeTicker: dataSource.activeTicker,
      companyDetail: discovery.companyDetail,
      selectedSearchCompany: discovery.selectedSearchCompany,
    },
    search: {
      feedback: discovery.searchFeedback,
      results: discovery.searchResults,
      isSearching: discovery.isSearching,
      coverageFilter: discovery.coverageFilter,
      setCoverageFilter: discovery.setCoverageFilter,
      handleSearch: discovery.handleSearch,
      handleSearchPreview: discovery.handleSearchPreview,
      handleSelectSearchResult: discovery.handleSelectSearchResult,
    },
    workspace: {
      mode: discovery.workspaceMode,
      scenario,
      setScenario,
      assumptions,
      handleAssumptionChange,
    },
    valuation: {
      currentValue: display.currentValue,
      displayScenario: display.displayScenario,
      displayCurrency: dataSource.displayCurrency,
      valuationRange: display.valuationRange,
      histogram: display.histogram,
      valueCardAssumptions: display.valueCardAssumptions,
      detailsForDisplay: display.detailsForDisplay,
      sensitivityMatrix: display.sensitivityMatrix,
      isComputing: dataSource.isComputing,
      isReplayDisplay: display.isReplayDisplay,
      isReplayLoading: dataSource.isReplayLoading,
      error: dataSource.error,
      clearError: dataSource.clearError,
    },
    history: {
      runHistory: dataSource.runHistory,
      isRunHistoryLoading: dataSource.isRunHistoryLoading,
      runHistoryError: dataSource.effectiveRunHistoryError,
      selectedRunId,
      recentCompanies: discovery.recentCompanies,
      handleSelectCompany: discovery.handleSelectCompany,
      handleSelectRun,
    },
    import: {
      parseResult: importWorkflow.importParseResult,
      status: importWorkflow.importStatus,
      error: importWorkflow.importError,
      handleImportParse: importWorkflow.handleImportParse,
      handleApproveImport: importWorkflow.handleApproveImport,
    },
    ai: {
      status: ai.aiAnalysisStatus,
      rationales: ai.aiRationales,
      stream: ai.aiAnalysisStream,
      tokenUsage: ai.aiTokenUsage,
      adminModeEnabled: ai.aiAdminModeEnabled,
      handleApplyAiAnalysis: ai.handleApplyAiAnalysis,
      handleAdminTokenChange: ai.handleAiAdminTokenChange,
    },
    settings: {
      status: dataSource.settingsStatus,
    },
    drawers: {
      activeDrawer,
      closeDrawers,
      openLibraryDrawer,
      openAssumptionsDrawer,
    },
    demo: {
      isDemoMode: dataSource.isDemoMode,
      mockDatasets,
      mockPriceHistory,
    },
  };
}
