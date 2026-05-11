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
import styles from './page.module.css';

function DashboardShell() {
  const {
    activeCompanyId,
    activeDrawer,
    activeTicker,
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
    recentCompanies,
    runHistory,
    runHistoryError,
    scenario,
    searchFeedback,
    searchResults,
    selectedSearchCompany,
    selectedRunId,
    sensitivityMatrix,
    setScenario,
    setCoverageFilter,
    settingsStatus,
    valuationRange,
    valueCardAssumptions,
    workspaceMode,
    aiAnalysisStream,
    aiAnalysisStatus,
    aiAdminModeEnabled,
    aiRationales,
    aiTokenUsage,
    handleAiAdminTokenChange,
  } = useDashboardController();
  const showLiveComputeState = !isReplayDisplay && isComputing;
  const blockingError = isReplayDisplay ? null : error;
  const hasValuationData =
    !blockingError && !showLiveComputeState && !isReplayLoading && currentValue !== null;

  const leftRailSharedProps = {
    datasets: isDemoMode ? mockDatasets : undefined,
    runHistory,
    recentCompanies,
    isRunHistoryLoading,
    runHistoryError: runHistoryError?.message ?? null,
    selectedRunId: selectedRunId ?? undefined,
    selectedCompanyId: activeCompanyId ?? undefined,
    coverageFilter,
    onCoverageFilterChange: setCoverageFilter,
  };
  const rightPanelSharedProps = {
    assumptions,
    scenario,
    onAssumptionChange: handleAssumptionChange,
    isCalculating: showLiveComputeState,
    onApplyAiAnalysis:
      !isDemoMode && workspaceMode === 'valuation' && hasValuationData
        ? handleApplyAiAnalysis
        : undefined,
    aiAnalysisStatus,
    aiAdminModeEnabled,
    onAiAdminTokenChange: isDemoMode ? undefined : handleAiAdminTokenChange,
  };

  return (
    <div className={styles.layout}>
      <TopBar
        ticker={activeTicker}
        priceHistory={isDemoMode ? mockPriceHistory : undefined}
        currentPrice={isDemoMode ? 152.35 : undefined}
        onSearch={handleSearch}
        onSearchPreview={handleSearchPreview}
        searchResults={searchResults}
        isSearching={isSearching}
        onSelectSearchResult={handleSelectSearchResult}
        onOpenLibrary={openLibraryDrawer}
        onOpenAssumptions={openAssumptionsDrawer}
        disableSearchShortcut={activeDrawer !== null}
      />

      <LeftRail
        {...leftRailSharedProps}
        onSelectCompany={(id) => handleSelectCompany(id, 'docked')}
        onSelectRun={(id) => handleSelectRun(id, 'docked')}
        variant="docked"
      />

      <main className={styles.workspace}>
        <div className={styles.workspaceContent}>
          <div className={`${styles.scenarioHeader} ${styles.reveal} ${styles.revealDelay1}`}>
            <ScenarioTabs value={scenario} onChange={setScenario} />
          </div>

          {searchFeedback && (
            <p className={`${styles.searchFeedback} ${styles.reveal} ${styles.revealDelay2}`} role="status" aria-live="polite">
              {searchFeedback}
            </p>
          )}

          {!isDemoMode && selectedSearchCompany && workspaceMode === 'import' ? (
            <ImportWorkspace
              className={`${styles.reveal} ${styles.revealDelay2}`}
              company={selectedSearchCompany}
              parseResult={importParseResult}
              status={importStatus}
              error={importError}
              onParse={handleImportParse}
              onApprove={handleApproveImport}
            />
          ) : null}

          {!isDemoMode && companyDetail && workspaceMode === 'detail' ? (
            <CompanyDetailPanel
              className={`${styles.reveal} ${styles.revealDelay2}`}
              company={companyDetail}
            />
          ) : null}

          {blockingError && workspaceMode === 'valuation' ? (
            <ErrorState
              className={styles.inlineError}
              title="Unable to refresh valuation"
              message={blockingError.message || 'Something went wrong while updating this workspace.'}
              onRetry={clearError}
            />
          ) : workspaceMode !== 'valuation' ? null : showLiveComputeState || isReplayLoading || currentValue === null ? (
            <ValueCardSkeleton />
          ) : (
            <ValueCard
              className={`${styles.reveal} ${styles.revealDelay2}`}
              value={currentValue}
              scenario={displayScenario}
              ticker={activeTicker}
              histogram={histogram}
              range={valuationRange}
              currency={displayCurrency}
              assumptions={valueCardAssumptions}
              isCalculating={showLiveComputeState}
            />
          )}

          {workspaceMode === 'valuation' && !isDemoMode ? (
            <AiAnalysisPanel
              className={`${styles.reveal} ${styles.revealDelay3}`}
              status={aiAnalysisStatus}
              rationales={aiRationales}
              stream={aiAnalysisStream}
              expectedStreamSteps={AI_ANALYSIS_PROGRESS_STEP_COUNT}
              tokenUsage={aiTokenUsage}
            />
          ) : null}

          {workspaceMode !== 'valuation' ? null : showLiveComputeState ? (
            <SensitivitySectionSkeleton />
          ) : hasValuationData && sensitivityMatrix ? (
            <SensitivitySection
              className={`${styles.reveal} ${styles.revealDelay3}`}
              data={sensitivityMatrix}
              growthOffsets={detailsForDisplay?.sensitivity?.growthOffsets}
              waccOffsets={detailsForDisplay?.sensitivity?.waccOffsets}
              baseGrowthRate={valueCardAssumptions.revenueGrowth}
              baseWaccRate={valueCardAssumptions.discountRate}
            />
          ) : (
            null
          )}

          {workspaceMode === 'valuation' && hasValuationData && detailsForDisplay ? (
            <ValuationDetails
              className={`${styles.reveal} ${styles.revealDelay4}`}
              kpis={detailsForDisplay.kpis}
              statementHistory={detailsForDisplay.statementHistory}
              monteCarloSummary={detailsForDisplay.monteCarloSummary}
              provenance={detailsForDisplay.provenance}
            />
          ) : null}

          {workspaceMode !== 'valuation' ? null : showLiveComputeState ? (
            <MetricsTableSkeleton />
          ) : hasValuationData && detailsForDisplay?.projections.length ? (
            <MetricsTable
              className={`${styles.reveal} ${styles.revealDelay4}`}
              projections={detailsForDisplay.projections}
            />
          ) : hasValuationData && isDemoMode ? (
            <MetricsTable className={`${styles.reveal} ${styles.revealDelay4}`} />
          ) : hasValuationData ? (
            <p className={`${styles.searchFeedback} ${styles.reveal} ${styles.revealDelay4}`}>
              Financial projections are unavailable for this live valuation.
            </p>
          ) : (
            null
          )}

          {!isDemoMode ? (
            <SettingsStatusPanel
              className={`${styles.reveal} ${styles.revealDelay4}`}
              status={settingsStatus}
            />
          ) : null}
        </div>
      </main>

      <RightPanel
        {...rightPanelSharedProps}
        variant="docked"
      />

      <Drawer
        open={activeDrawer === 'library'}
        onClose={closeDrawers}
        title="Dataset Library"
        side="left"
      >
        <LeftRail
          {...leftRailSharedProps}
          onSelectCompany={(id) => handleSelectCompany(id, 'drawer')}
          onSelectRun={(id) => handleSelectRun(id, 'drawer')}
          variant="drawer"
        />
      </Drawer>

      <Drawer
        open={activeDrawer === 'assumptions'}
        onClose={closeDrawers}
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
