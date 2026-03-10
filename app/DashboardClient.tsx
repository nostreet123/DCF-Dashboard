'use client';

import { TopBar } from '@/components/layout/TopBar';
import { LeftRail } from '@/components/layout/LeftRail';
import { RightPanel } from '@/components/layout/RightPanel';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorState } from '@/components/ui/ErrorState';
import { ScenarioTabs } from '@/components/workspace/ScenarioTabs';
import { ValueCard } from '@/components/workspace/ValueCard';
import { ValueCardSkeleton } from '@/components/workspace/ValueCardSkeleton';
import { SensitivitySection } from '@/components/workspace/SensitivitySection';
import { SensitivitySectionSkeleton } from '@/components/workspace/SensitivitySectionSkeleton';
import { MetricsTable } from '@/components/workspace/MetricsTable';
import { MetricsTableSkeleton } from '@/components/workspace/MetricsTableSkeleton';
import { WorkbenchProvider } from '@/lib/contexts/WorkbenchContext';
import { useDashboardController } from '@/lib/hooks/useDashboardController';
import styles from './page.module.css';

function DashboardShell() {
  const {
    activeCompanyId,
    activeDrawer,
    activeTicker,
    assumptions,
    closeDrawers,
    clearError,
    currentValue,
    error,
    handleAssumptionChange,
    handleSearch,
    handleSelectCompany,
    handleSelectRun,
    histogram,
    isComputing,
    isReplayLoading,
    isRunHistoryLoading,
    mockDatasets,
    mockPriceHistory,
    openAssumptionsDrawer,
    openLibraryDrawer,
    runHistory,
    runHistoryError,
    scenario,
    searchFeedback,
    selectedRunId,
    setScenario,
    valuationRange,
  } = useDashboardController();

  const leftRailSharedProps = {
    datasets: mockDatasets,
    runHistory,
    isRunHistoryLoading,
    runHistoryError: runHistoryError?.message ?? null,
    selectedRunId: selectedRunId ?? undefined,
    selectedCompanyId: activeCompanyId ?? undefined,
  };
  const rightPanelSharedProps = {
    assumptions,
    onAssumptionChange: handleAssumptionChange,
    isCalculating: isComputing,
  };

  return (
    <div className={styles.layout}>
      <TopBar
        ticker={activeTicker}
        priceHistory={mockPriceHistory}
        currentPrice={152.35}
        onSearch={handleSearch}
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

          {error ? (
            <ErrorState
              className={styles.inlineError}
              title="Unable to refresh valuation"
              message={error.message || 'Something went wrong while updating this workspace.'}
              onRetry={clearError}
            />
          ) : isComputing || isReplayLoading ? (
            <ValueCardSkeleton />
          ) : (
            <ValueCard
              className={`${styles.reveal} ${styles.revealDelay2}`}
              value={currentValue}
              scenario={scenario}
              ticker={activeTicker}
              histogram={histogram}
              range={valuationRange}
            />
          )}

          {isComputing ? (
            <SensitivitySectionSkeleton />
          ) : (
            <SensitivitySection className={`${styles.reveal} ${styles.revealDelay3}`} />
          )}

          {isComputing ? (
            <MetricsTableSkeleton />
          ) : (
            <MetricsTable className={`${styles.reveal} ${styles.revealDelay4}`} />
          )}
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
