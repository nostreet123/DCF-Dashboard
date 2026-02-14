'use client';

import { useEffect, useRef, useState } from 'react';
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
import styles from './page.module.css';

type Scenario = 'base' | 'bull' | 'bear';
type ViewMode = 'workbench' | 'investor';

// Mock data for demonstration
const mockDatasets = {
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
  { id: 'r1', timestamp: new Date(Date.now() - 3600000), ticker: 'AAPL', value: 145.20 },
  { id: 'r2', timestamp: new Date(Date.now() - 7200000), ticker: 'MSFT', value: 378.50 },
  { id: 'r3', timestamp: new Date(Date.now() - 86400000), ticker: 'GOOGL', value: 142.80 },
];

const mockPriceHistory = [140, 142, 138, 145, 143, 148, 146, 150, 152];

const mockHistogram = {
  binCenters: [100, 110, 120, 130, 140, 150, 160, 170, 180, 190],
  density: [0.02, 0.05, 0.12, 0.22, 0.28, 0.18, 0.08, 0.03, 0.015, 0.005],
};

const scenarioValues = {
  base: 145.20,
  bull: 185.50,
  bear: 112.30,
};

export default function DashboardPage() {
  const [scenario, setScenario] = useState<Scenario>('base');
  const [viewMode, setViewMode] = useState<ViewMode>('workbench');
  const [activeDrawer, setActiveDrawer] = useState<'library' | 'assumptions' | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('1');
  const [isComputing, setIsComputing] = useState(false);
  const computeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [assumptions, setAssumptions] = useState({
    revenueGrowth: 12,
    operatingMargin: 25,
    discountRate: 10,
    terminalGrowth: 2.5,
  });

  const handleAssumptionChange = (
    key: keyof typeof assumptions,
    value: number
  ) => {
    setIsComputing(true);
    if (computeTimeoutRef.current) {
      clearTimeout(computeTimeoutRef.current);
    }
    computeTimeoutRef.current = setTimeout(() => {
      setIsComputing(false);
      computeTimeoutRef.current = null;
    }, 520);

    setAssumptions((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    return () => {
      if (computeTimeoutRef.current) {
        clearTimeout(computeTimeoutRef.current);
      }
    };
  }, []);

  const currentValue = scenarioValues[scenario];

  const openLibraryDrawer = () => {
    setActiveDrawer('library');
  };

  const openAssumptionsDrawer = () => {
    setActiveDrawer('assumptions');
  };

  const closeDrawers = () => {
    setActiveDrawer(null);
  };

  const handleSelectCompany = (id: string) => {
    setSelectedCompanyId(id);
    closeDrawers();
  };

  return (
    <div className={styles.layout}>
      <TopBar
        ticker="AAPL"
        priceHistory={mockPriceHistory}
        currentPrice={152.35}
        mode={viewMode}
        onModeChange={setViewMode}
        onSearch={(q) => console.log('Search:', q)}
        onOpenLibrary={openLibraryDrawer}
        onOpenAssumptions={openAssumptionsDrawer}
      />

      <LeftRail
        datasets={mockDatasets}
        runHistory={mockRunHistory}
        selectedCompanyId={selectedCompanyId}
        onSelectCompany={setSelectedCompanyId}
        onSelectRun={(id) => console.log('Select run:', id)}
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
              ticker="AAPL"
              histogram={mockHistogram}
              range={[112.30, 185.50]}
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
          selectedCompanyId={selectedCompanyId}
          onSelectCompany={handleSelectCompany}
          onSelectRun={(id) => {
            console.log('Select run:', id);
            closeDrawers();
          }}
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
