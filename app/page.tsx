'use client';

import { useEffect, useRef } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { LeftRail } from '@/components/layout/LeftRail';
import { RightPanel } from '@/components/layout/RightPanel';
import { Drawer } from '@/components/ui/Drawer';
import { ScenarioTabs } from '@/components/workspace/ScenarioTabs';
import { ValueCard } from '@/components/workspace/ValueCard';
import { ValueCardSkeleton } from '@/components/workspace/ValueCardSkeleton';
import { SensitivitySection } from '@/components/workspace/SensitivitySection';
import { SensitivitySectionSkeleton } from '@/components/workspace/SensitivitySectionSkeleton';
import { MetricsTable } from '@/components/workspace/MetricsTable';
import { MetricsTableSkeleton } from '@/components/workspace/MetricsTableSkeleton';
import { useCurrentAssumptions, useWorkbench } from '@/lib/contexts/WorkbenchContext';
import {
  type DatasetGroups,
  resolveActiveCompany,
  useWorkbenchViewState,
} from '@/lib/hooks/useWorkbenchViewState';
import styles from './page.module.css';

const mockDatasets: DatasetGroups = {
  Technology: [
    { id: '1', name: 'Apple Inc.', ticker: 'AAPL' },
    { id: '2', name: 'Microsoft Corp.', ticker: 'MSFT' },
    { id: '3', name: 'Alphabet Inc.', ticker: 'GOOGL' },
    { id: '4', name: 'Amazon.com Inc.', ticker: 'AMZN' },
  ],
  Finance: [
    { id: '5', name: 'JPMorgan Chase', ticker: 'JPM' },
    { id: '6', name: 'Goldman Sachs', ticker: 'GS' },
  ],
  Healthcare: [
    { id: '7', name: 'Johnson & Johnson', ticker: 'JNJ' },
    { id: '8', name: 'Pfizer Inc.', ticker: 'PFE' },
  ],
};

const mockRunHistory = [
  { id: 'r1', timestamp: new Date(Date.now() - 3600000), ticker: 'AAPL', value: 145.2 },
  { id: 'r2', timestamp: new Date(Date.now() - 7200000), ticker: 'MSFT', value: 378.5 },
  { id: 'r3', timestamp: new Date(Date.now() - 86400000), ticker: 'GOOGL', value: 142.8 },
];

const mockPriceHistory = [140, 142, 138, 145, 143, 148, 146, 150, 152];

const mockHistogram = {
  binCenters: [100, 110, 120, 130, 140, 150, 160, 170, 180, 190],
  density: [0.02, 0.05, 0.12, 0.22, 0.28, 0.18, 0.08, 0.03, 0.015, 0.005],
};

const scenarioValues = {
  base: 145.2,
  bull: 185.5,
  bear: 112.3,
};

const fallbackRange: [number, number] = [112.3, 185.5];

function findCompanyBySearch(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const allCompanies = Object.values(mockDatasets).flat();
  return (
    allCompanies.find(
      (item) =>
        item.ticker.toLowerCase() === normalized || item.name.toLowerCase().includes(normalized),
    ) ?? null
  );
}

export default function DashboardPage() {
  const {
    scenario,
    selectedCompanyId,
    selectCompany,
    setScenario,
    setSelectedRunId,
    updateAssumption,
    isComputing,
    setIsComputing,
    result,
  } = useWorkbench();
  const assumptions = useCurrentAssumptions();
  const {
    viewMode,
    setViewMode,
    activeDrawer,
    openLibraryDrawer,
    openAssumptionsDrawer,
    closeDrawers,
    onCompanySelected,
    onRunSelected,
  } = useWorkbenchViewState();

  const computeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (computeTimeoutRef.current) {
        clearTimeout(computeTimeoutRef.current);
      }
    };
  }, []);

  const activeCompany = resolveActiveCompany(mockDatasets, selectedCompanyId);
  const activeCompanyId = activeCompany?.id ?? null;
  const activeTicker = activeCompany?.ticker ?? 'AAPL';

  const handleAssumptionChange = (key: keyof typeof assumptions, value: number) => {
    setIsComputing(true);
    if (computeTimeoutRef.current) {
      clearTimeout(computeTimeoutRef.current);
    }
    computeTimeoutRef.current = setTimeout(() => {
      setIsComputing(false);
      computeTimeoutRef.current = null;
    }, 520);

    updateAssumption(key, value);
  };

  const handleSelectCompany = (id: string, source: 'docked' | 'drawer') => {
    const company = resolveActiveCompany(mockDatasets, id);
    selectCompany(company?.id ?? id, company?.ticker ?? null);
    onCompanySelected(source);
  };

  const handleSelectRun = (id: string, source: 'docked' | 'drawer') => {
    setSelectedRunId(id);
    onRunSelected(source);
  };

  const handleSearch = (query: string) => {
    const company = findCompanyBySearch(query);
    if (company) {
      selectCompany(company.id, company.ticker);
    }
  };

  const currentValue = result?.fairValue ?? scenarioValues[scenario];
  const histogram = result?.histogram ?? mockHistogram;
  const valuationRange = result?.range ?? fallbackRange;

  return (
    <div className={styles.layout}>
      <TopBar
        ticker={activeTicker}
        priceHistory={mockPriceHistory}
        currentPrice={152.35}
        mode={viewMode}
        onModeChange={setViewMode}
        onSearch={handleSearch}
        onOpenLibrary={openLibraryDrawer}
        onOpenAssumptions={openAssumptionsDrawer}
      />

      <LeftRail
        datasets={mockDatasets}
        runHistory={mockRunHistory}
        selectedCompanyId={activeCompanyId ?? undefined}
        onSelectCompany={(id) => handleSelectCompany(id, 'docked')}
        onSelectRun={(id) => handleSelectRun(id, 'docked')}
        variant="docked"
      />

      <main className={styles.workspace}>
        <div className={styles.workspaceContent}>
          <div className={`${styles.scenarioHeader} ${styles.reveal} ${styles.revealDelay1}`}>
            <ScenarioTabs value={scenario} onChange={setScenario} />
          </div>

          {isComputing ? (
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
        assumptions={assumptions}
        onAssumptionChange={handleAssumptionChange}
        isCalculating={isComputing}
        variant="docked"
      />

      <Drawer
        open={activeDrawer === 'library'}
        onClose={closeDrawers}
        title="Dataset Library"
        side="left"
      >
        <LeftRail
          datasets={mockDatasets}
          runHistory={mockRunHistory}
          selectedCompanyId={activeCompanyId ?? undefined}
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
          assumptions={assumptions}
          onAssumptionChange={handleAssumptionChange}
          isCalculating={isComputing}
          variant="drawer"
        />
      </Drawer>
    </div>
  );
}
