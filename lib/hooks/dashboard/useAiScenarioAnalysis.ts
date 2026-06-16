'use client';

import { useCallback, useRef, useState } from 'react';
import {
  buildAiValuationContext,
  getAiAnalysisProgressMessages,
  type AiTokenUsage,
  type ConvexImportContext,
} from '@/lib/ai/valuationContext';
import type { CompanySearchResult } from '@/lib/contracts/company';
import type { DcfResult } from '@/lib/hooks/useDcfCompute';
import type { ValuationReplaySnapshot } from '@/lib/hooks/useValuationHistory';
import type { Assumptions, Scenario } from '@/lib/workbench/scenarioProfiles';
import type { AiAnalysisStatus, WorkspaceMode } from '@/lib/dashboard/viewModel';

export function useAiScenarioAnalysis({
  activeCompanyId,
  activeTicker,
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
  setScenario,
  setScenarioAssumptions,
  setSelectedRunId,
  shouldLoadBrowserHistory,
  workspaceMode,
  aiAdminToken,
  aiAdminModeEnabled,
  setAiAdminToken,
  setAiAdminModeEnabled,
}: {
  activeCompanyId: string | null;
  activeTicker: string;
  companyDetail: CompanySearchResult | null;
  convexImportContext: ConvexImportContext | null;
  displayCurrency: string;
  isDemoMode: boolean;
  isComputing: boolean;
  replay: ValuationReplaySnapshot | null;
  resultForDisplay: DcfResult | null;
  scenario: Scenario;
  scenarioAssumptions: Record<Scenario, Assumptions>;
  selectedSearchCompany: CompanySearchResult | null;
  setScenario: (scenario: Scenario) => void;
  setScenarioAssumptions: (assumptions: Record<Scenario, Assumptions>) => void;
  setSelectedRunId: (runId: string | null) => void;
  shouldLoadBrowserHistory: boolean;
  workspaceMode: WorkspaceMode;
  aiAdminToken: string | null;
  aiAdminModeEnabled: boolean;
  setAiAdminToken: (token: string | null) => void;
  setAiAdminModeEnabled: (enabled: boolean) => void;
}) {
  const [aiAnalysisStatus, setAiAnalysisStatus] = useState<AiAnalysisStatus>('idle');
  const [aiRationales, setAiRationales] = useState<Partial<Record<Scenario, string>>>({});
  const [aiAnalysisStream, setAiAnalysisStream] = useState<string[]>([]);
  const [aiTokenUsage, setAiTokenUsage] = useState<AiTokenUsage | null>(null);

  const aiAnalysisRequestIdRef = useRef(0);
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

  const resetAiAnalysisState = useCallback(() => {
    aiAnalysisRequestIdRef.current += 1;
    setAiAnalysisStatus('idle');
    setAiRationales({});
    setAiAnalysisStream([]);
    setAiTokenUsage(null);
  }, []);

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
    const progressMessages = getAiAnalysisProgressMessages();
    setAiAnalysisStatus('loading');
    setAiRationales({});
    setAiTokenUsage(null);
    setAiAnalysisStream([progressMessages[0]]);
    let progressIndex = 1;
    const progressTimer = window.setInterval(() => {
      if (progressIndex >= progressMessages.length) {
        return;
      }
      const nextMessage = progressMessages[progressIndex];
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
        analysis?: Record<'base' | 'bull' | 'bear', Assumptions & { rationale: string }>;
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
      const stripRationale = (values: Assumptions & { rationale: string }) => ({
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
      setScenario(aiScenario);
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
    setScenario,
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
  }, [setAiAdminModeEnabled, setAiAdminToken]);

  return {
    aiAnalysisStatus,
    aiRationales,
    aiAnalysisStream,
    aiTokenUsage,
    aiAdminModeEnabled,
    handleApplyAiAnalysis,
    handleAiAdminTokenChange,
    resetAiAnalysisState,
  };
}
