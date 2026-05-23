'use client';

import { TopBar } from '@/components/layout/TopBar';
import { LeftRail } from '@/components/layout/LeftRail';
import { RightPanel } from '@/components/layout/RightPanel';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorState } from '@/components/ui/ErrorState';
import { ScenarioTabs } from '@/components/workspace/ScenarioTabs';
import { ValueCard } from '@/components/workspace/ValueCard';
import { ValueCardSkeleton } from '@/components/workspace/ValueCardSkeleton';
import { AiAnalysisPanel } from '@/components/workspace/AiAnalysisPanel';
import { SensitivitySection } from '@/components/workspace/SensitivitySection';
import { SensitivitySectionSkeleton } from '@/components/workspace/SensitivitySectionSkeleton';
import { MetricsTable } from '@/components/workspace/MetricsTable';
import { MetricsTableSkeleton } from '@/components/workspace/MetricsTableSkeleton';
import {
  CompanyDetailPanel,
  ImportWorkspace,
  SettingsStatusPanel,
} from '@/components/workspace/ParityPanels';
import { ValuationDetails } from '@/components/workspace/ValuationDetails';
import { WorkbenchProvider } from '@/lib/contexts/WorkbenchContext';
import {
  AI_ANALYSIS_PROGRESS_STEP_COUNT,
  useDashboardController,
} from '@/lib/hooks/useDashboardController';
import { shouldShowSettingsStatusPanel } from '@/lib/settingsStatus';
import styles from './page.module.css';

function DashboardShell() {
  const { company, search, workspace, valuation, history, import: importFlow, ai, settings, drawers, demo } =
    useDashboardController();

  const showLiveComputeState = !valuation.isReplayDisplay && valuation.isComputing;
  const blockingError = valuation.isReplayDisplay ? null : valuation.error;
  const hasValuationData =
    !blockingError && !showLiveComputeState && !valuation.isReplayLoading && valuation.currentValue !== null;

  const leftRailSharedProps = {
    datasets: demo.isDemoMode ? demo.mockDatasets : undefined,
    runHistory: history.runHistory,
    recentCompanies: history.recentCompanies,
    isRunHistoryLoading: history.isRunHistoryLoading,
    runHistoryError: history.runHistoryError?.message ?? null,
    selectedRunId: history.selectedRunId ?? undefined,
    selectedCompanyId: company.activeCompanyId ?? undefined,
    coverageFilter: search.coverageFilter,
    onCoverageFilterChange: search.setCoverageFilter,
  };
  const rightPanelSharedProps = {
    assumptions: workspace.assumptions,
    scenario: workspace.scenario,
    onAssumptionChange: workspace.handleAssumptionChange,
    isCalculating: showLiveComputeState,
    onApplyAiAnalysis:
      !demo.isDemoMode && workspace.mode === 'valuation' && hasValuationData
        ? ai.handleApplyAiAnalysis
        : undefined,
    aiAnalysisStatus: ai.status,
    aiAdminModeEnabled: ai.adminModeEnabled,
    onAiAdminTokenChange: demo.isDemoMode ? undefined : ai.handleAdminTokenChange,
  };

  return (
    <div className={styles.layout}>
      <TopBar
        ticker={company.activeTicker}
        priceHistory={demo.isDemoMode ? demo.mockPriceHistory : undefined}
        currentPrice={demo.isDemoMode ? 152.35 : undefined}
        onSearch={search.handleSearch}
        onSearchPreview={search.handleSearchPreview}
        searchResults={search.results}
        isSearching={search.isSearching}
        onSelectSearchResult={search.handleSelectSearchResult}
        onOpenLibrary={drawers.openLibraryDrawer}
        onOpenAssumptions={drawers.openAssumptionsDrawer}
        disableSearchShortcut={drawers.activeDrawer !== null}
      />

      <LeftRail
        {...leftRailSharedProps}
        onSelectCompany={(id) => history.handleSelectCompany(id, 'docked')}
        onSelectRun={(id) => history.handleSelectRun(id, 'docked')}
        variant="docked"
      />

      <main className={styles.workspace}>
        <div className={styles.workspaceContent}>
          <div className={`${styles.scenarioHeader} ${styles.reveal} ${styles.revealDelay1}`}>
            <ScenarioTabs value={workspace.scenario} onChange={workspace.setScenario} />
          </div>

          {search.feedback && (
            <p className={`${styles.searchFeedback} ${styles.reveal} ${styles.revealDelay2}`} role="status" aria-live="polite">
              {search.feedback}
            </p>
          )}

          {!demo.isDemoMode && company.selectedSearchCompany && workspace.mode === 'import' ? (
            <ImportWorkspace
              className={`${styles.reveal} ${styles.revealDelay2}`}
              company={company.selectedSearchCompany}
              parseResult={importFlow.parseResult}
              status={importFlow.status}
              error={importFlow.error}
              onParse={importFlow.handleImportParse}
              onApprove={importFlow.handleApproveImport}
            />
          ) : null}

          {!demo.isDemoMode && company.companyDetail && workspace.mode === 'detail' ? (
            <CompanyDetailPanel
              className={`${styles.reveal} ${styles.revealDelay2}`}
              company={company.companyDetail}
            />
          ) : null}

          {blockingError && workspace.mode === 'valuation' ? (
            <ErrorState
              className={styles.inlineError}
              title="Unable to refresh valuation"
              message={blockingError.message || 'Something went wrong while updating this workspace.'}
              onRetry={valuation.clearError}
            />
          ) : workspace.mode !== 'valuation' ? null : showLiveComputeState || valuation.isReplayLoading || valuation.currentValue === null ? (
            <ValueCardSkeleton />
          ) : (
            <ValueCard
              className={`${styles.reveal} ${styles.revealDelay2}`}
              value={valuation.currentValue}
              scenario={valuation.displayScenario}
              ticker={company.activeTicker}
              histogram={valuation.histogram}
              range={valuation.valuationRange}
              currency={valuation.displayCurrency}
              assumptions={valuation.valueCardAssumptions}
              isCalculating={showLiveComputeState}
            />
          )}

          {workspace.mode === 'valuation' && !demo.isDemoMode ? (
            <AiAnalysisPanel
              className={`${styles.reveal} ${styles.revealDelay3}`}
              status={ai.status}
              rationales={ai.rationales}
              stream={ai.stream}
              expectedStreamSteps={AI_ANALYSIS_PROGRESS_STEP_COUNT}
              tokenUsage={ai.tokenUsage}
            />
          ) : null}

          {workspace.mode !== 'valuation' ? null : showLiveComputeState ? (
            <SensitivitySectionSkeleton />
          ) : hasValuationData && valuation.sensitivityMatrix ? (
            <SensitivitySection
              className={`${styles.reveal} ${styles.revealDelay3}`}
              data={valuation.sensitivityMatrix}
              growthOffsets={valuation.detailsForDisplay?.sensitivity?.growthOffsets}
              waccOffsets={valuation.detailsForDisplay?.sensitivity?.waccOffsets}
              baseGrowthRate={valuation.valueCardAssumptions.revenueGrowth}
              baseWaccRate={valuation.valueCardAssumptions.discountRate}
            />
          ) : (
            null
          )}

          {workspace.mode === 'valuation' && hasValuationData && valuation.detailsForDisplay ? (
            <ValuationDetails
              className={`${styles.reveal} ${styles.revealDelay4}`}
              kpis={valuation.detailsForDisplay.kpis}
              statementHistory={valuation.detailsForDisplay.statementHistory}
              monteCarloSummary={valuation.detailsForDisplay.monteCarloSummary}
              provenance={valuation.detailsForDisplay.provenance}
            />
          ) : null}

          {workspace.mode !== 'valuation' ? null : showLiveComputeState ? (
            <MetricsTableSkeleton />
          ) : hasValuationData && valuation.detailsForDisplay?.projections.length ? (
            <MetricsTable
              className={`${styles.reveal} ${styles.revealDelay4}`}
              projections={valuation.detailsForDisplay.projections}
            />
          ) : hasValuationData && demo.isDemoMode ? (
            <MetricsTable className={`${styles.reveal} ${styles.revealDelay4}`} />
          ) : hasValuationData ? (
            <p className={`${styles.searchFeedback} ${styles.reveal} ${styles.revealDelay4}`}>
              Financial projections are unavailable for this live valuation.
            </p>
          ) : (
            null
          )}

          {shouldShowSettingsStatusPanel({
            isDemoMode: demo.isDemoMode,
            aiAdminModeEnabled: ai.adminModeEnabled,
            settingsStatus: settings.status,
          }) ? (
            <SettingsStatusPanel
              className={`${styles.reveal} ${styles.revealDelay4}`}
              status={settings.status}
            />
          ) : null}
        </div>
      </main>

      <RightPanel
        {...rightPanelSharedProps}
        variant="docked"
      />

      <Drawer
        open={drawers.activeDrawer === 'library'}
        onClose={drawers.closeDrawers}
        title="Dataset Library"
        side="left"
      >
        <LeftRail
          {...leftRailSharedProps}
          onSelectCompany={(id) => history.handleSelectCompany(id, 'drawer')}
          onSelectRun={(id) => history.handleSelectRun(id, 'drawer')}
          variant="drawer"
        />
      </Drawer>

      <Drawer
        open={drawers.activeDrawer === 'assumptions'}
        onClose={drawers.closeDrawers}
        title="Assumptions"
        side="right"
      >
        <RightPanel
          {...rightPanelSharedProps}
          variant="drawer"
        />
      </Drawer>
    </div>
  );
}

export function DashboardClient() {
  return (
    <WorkbenchProvider>
      <DashboardShell />
    </WorkbenchProvider>
  );
}
