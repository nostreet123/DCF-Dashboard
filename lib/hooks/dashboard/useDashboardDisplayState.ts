import type { DcfResult } from '@/lib/hooks/useDcfCompute';
import type { ValuationReplaySnapshot } from '@/lib/hooks/useValuationHistory';
import type { Assumptions, Scenario } from '@/lib/workbench/scenarioProfiles';
import type { WorkspaceMode } from '@/lib/dashboard/viewModel';

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

export const shouldComputeLiveValuation = ({
  isDemoMode,
  selectedRunId,
  workspaceMode,
}: {
  isDemoMode: boolean;
  selectedRunId: string | null | undefined;
  workspaceMode: WorkspaceMode;
}) => !isDemoMode && workspaceMode === 'valuation' && !selectedRunId;

export function useDashboardDisplayState({
  scenario,
  scenarioAssumptions,
  resultForDisplay,
  replay,
  isDemoMode,
}: {
  scenario: Scenario;
  scenarioAssumptions: Record<Scenario, Assumptions>;
  resultForDisplay: DcfResult | null;
  replay: ValuationReplaySnapshot | null;
  isDemoMode: boolean;
}) {
  const { currentValue, displayScenario, histogram, valuationRange } = resolveDisplayedValuationData({
    scenario,
    liveResult: resultForDisplay,
    replaySnapshot: replay,
  });
  const detailsForDisplay = replay && !isDemoMode ? replay : resultForDisplay;
  const isReplayDisplay = replay !== null;
  const valueCardAssumptions =
    replay?.assumptions?.[displayScenario] ?? scenarioAssumptions[displayScenario];
  const sensitivityMatrix =
    replay && !isDemoMode ? replay.sensitivityMatrix : resultForDisplay?.sensitivityMatrix;

  return {
    currentValue,
    displayScenario,
    histogram,
    valuationRange,
    detailsForDisplay,
    isReplayDisplay,
    valueCardAssumptions,
    sensitivityMatrix,
  };
}
