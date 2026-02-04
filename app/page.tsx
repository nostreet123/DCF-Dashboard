'use client';

import { useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { LeftRail } from '@/components/layout/LeftRail';
import { RightPanel } from '@/components/layout/RightPanel';
import { ScenarioTabs } from '@/components/workspace/ScenarioTabs';
import { ValueCard } from '@/components/workspace/ValueCard';
import { SensitivitySection } from '@/components/workspace/SensitivitySection';
import { MetricsTable } from '@/components/workspace/MetricsTable';
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
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('1');
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
    setAssumptions((prev) => ({ ...prev, [key]: value }));
  };

  const currentValue = scenarioValues[scenario];

  return (
    <div className={styles.layout}>
      <TopBar
        ticker="AAPL"
        priceHistory={mockPriceHistory}
        currentPrice={152.35}
        mode={viewMode}
        onModeChange={setViewMode}
        onSearch={(q) => console.log('Search:', q)}
      />

      <LeftRail
        datasets={mockDatasets}
        runHistory={mockRunHistory}
        selectedCompanyId={selectedCompanyId}
        onSelectCompany={setSelectedCompanyId}
        onSelectRun={(id) => console.log('Select run:', id)}
      />

      <main className={styles.workspace}>
        <div className={styles.workspaceContent}>
          <div className={styles.scenarioHeader}>
            <ScenarioTabs value={scenario} onChange={setScenario} />
          </div>

          <ValueCard
            value={currentValue}
            scenario={scenario}
            ticker="AAPL"
            histogram={mockHistogram}
            range={[112.30, 185.50]}
          />

          <SensitivitySection />

          <MetricsTable />
        </div>
      </main>

      <RightPanel
        assumptions={assumptions}
        onAssumptionChange={handleAssumptionChange}
      />
    </div>
  );
}
