'use client';

import { ArrowDownIcon, ArrowUpIcon } from '@radix-ui/react-icons';
import { Slider } from '@/components/ui/Slider';
import {
  createDefaultAssumptions,
  scenarioAssumptionDefaults,
  type Assumptions,
  type Scenario,
} from '@/lib/workbench/scenarioProfiles';
import styles from './RightPanel.module.css';

interface SensitivityDriver {
  name: string;
  impact: 'high' | 'medium' | 'low';
  direction: 'positive' | 'negative';
}

interface RightPanelProps {
  /** Current assumption values */
  assumptions?: Assumptions;
  /** Current scenario */
  scenario?: Scenario;
  /** Assumption change callback */
  onAssumptionChange?: (key: keyof Assumptions, value: number) => void;
  /** Sensitivity drivers */
  drivers?: SensitivityDriver[];
  /** Whether calculation is in progress */
  isCalculating?: boolean;
  /** AI scenario analysis callback */
  onApplyAiAnalysis?: () => void;
  /** AI scenario analysis status */
  aiAnalysisStatus?: 'idle' | 'loading' | 'applied' | 'error';
  /** Whether this browser has an admin token stored for AI demo caps */
  aiAdminModeEnabled?: boolean;
  /** Saves or clears the browser-local admin token */
  onAiAdminTokenChange?: (token: string) => void;
  /** Layout variant */
  variant?: 'docked' | 'drawer';
}

/**
 * Right sidebar with assumption sliders and sensitivity drivers.
 * 300px fixed width.
 */
export function RightPanel({
  assumptions = createDefaultAssumptions(),
  scenario = 'base',
  onAssumptionChange,
  drivers,
  isCalculating,
  onApplyAiAnalysis,
  aiAnalysisStatus = 'idle',
  aiAdminModeEnabled = false,
  onAiAdminTokenChange,
  variant = 'docked',
}: RightPanelProps) {
  const activeDrivers = drivers && drivers.length > 0
    ? drivers
    : buildAssumptionDrivers(assumptions, scenario);
  const panelClass =
    variant === 'drawer'
      ? `${styles.panel} ${styles.drawer}`
      : `${styles.panel} ${styles.docked}`;

  return (
    <aside className={panelClass}>
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Assumptions</h3>
        <div className={styles.sliders} aria-live="polite">
          <Slider
            label="Revenue Growth"
            value={assumptions.revenueGrowth}
            min={-5}
            max={30}
            step={0.5}
            onChange={(v) => onAssumptionChange?.('revenueGrowth', v)}
            formatValue={(v) => `${v.toFixed(1)}%`}
          />
          <Slider
            label="Operating Margin"
            value={assumptions.operatingMargin}
            min={5}
            max={60}
            step={0.5}
            onChange={(v) => onAssumptionChange?.('operatingMargin', v)}
            formatValue={(v) => `${v.toFixed(1)}%`}
          />
          <Slider
            label="Discount Rate (WACC)"
            value={assumptions.discountRate}
            min={5}
            max={20}
            step={0.25}
            onChange={(v) => onAssumptionChange?.('discountRate', v)}
            formatValue={(v) => `${v.toFixed(2)}%`}
          />
          <Slider
            label="Terminal Growth"
            value={assumptions.terminalGrowth}
            min={0}
            max={5}
            step={0.1}
            onChange={(v) => onAssumptionChange?.('terminalGrowth', v)}
            formatValue={(v) => `${v.toFixed(1)}%`}
          />
        </div>
        {onApplyAiAnalysis ? (
          <div className={styles.aiBlock}>
            <button
              type="button"
              className={styles.aiButton}
              onClick={onApplyAiAnalysis}
              disabled={aiAnalysisStatus === 'loading'}
            >
              {aiAnalysisStatus === 'loading' ? 'Analyzing...' : 'Apply AI Analysis'}
            </button>
            {aiAnalysisStatus === 'error' ? (
              <p className={styles.aiStatus}>AI analysis is unavailable right now.</p>
            ) : null}
            {onAiAdminTokenChange ? (
              <details className={styles.adminMode}>
                <summary>
                  Admin mode
                  {aiAdminModeEnabled ? <span>Token entered</span> : null}
                </summary>
                <input
                  type="password"
                  aria-label="AI admin token"
                  placeholder={aiAdminModeEnabled ? 'Token saved locally' : 'Admin token'}
                  autoComplete="off"
                  maxLength={512}
                  onChange={(event) => onAiAdminTokenChange(event.currentTarget.value)}
                />
                <p>Kept only in memory until this page reloads. Admin calls bypass public AI demo caps.</p>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>What Drives the Range</h3>
        <ul className={styles.driverList}>
          {activeDrivers.map((driver, i) => (
            <li key={i} className={styles.driverItem}>
              <span className={styles.driverName}>{driver.name}</span>
              <div className={styles.driverMeta}>
                <span className={`${styles.driverImpact} ${styles[driver.impact]}`}>
                  {driver.impact}
                </span>
                <span className={styles.driverArrow}>
                  {driver.direction === 'positive' ? (
                    <ArrowUpIcon width={15} height={15} aria-label="Positive impact" />
                  ) : (
                    <ArrowDownIcon width={15} height={15} aria-label="Negative impact" />
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {isCalculating ? <div className={styles.calculatingLabel}>Recalculating assumptions...</div> : null}
    </aside>
  );
}

function buildAssumptionDrivers(assumptions: Assumptions, scenario: Scenario): SensitivityDriver[] {
  const defaults = scenarioAssumptionDefaults[scenario];
  const revenueDelta = assumptions.revenueGrowth - defaults.revenueGrowth;
  const marginDelta = assumptions.operatingMargin - defaults.operatingMargin;
  const discountDelta = assumptions.discountRate - defaults.discountRate;
  const terminalDelta = assumptions.terminalGrowth - defaults.terminalGrowth;

  return [
    {
      name: 'Revenue Growth',
      impact: impactForDelta(revenueDelta, 2, 'high'),
      direction: revenueDelta >= 0 ? 'positive' : 'negative',
    },
    {
      name: 'Discount Rate',
      impact: impactForDelta(discountDelta, 0.75, 'high'),
      direction: discountDelta < 0 ? 'positive' : 'negative',
    },
    {
      name: 'Operating Margin',
      impact: impactForDelta(marginDelta, 2, 'medium'),
      direction: marginDelta >= 0 ? 'positive' : 'negative',
    },
    {
      name: 'Terminal Growth',
      impact: impactForDelta(terminalDelta, 0.5, 'low'),
      direction: terminalDelta >= 0 ? 'positive' : 'negative',
    },
  ];
}

function impactForDelta(
  delta: number,
  highThreshold: number,
  fallback: SensitivityDriver['impact'],
): SensitivityDriver['impact'] {
  const absDelta = Math.abs(delta);
  if (absDelta < 0.001) {
    return fallback;
  }
  if (absDelta >= highThreshold) {
    return 'high';
  }
  if (absDelta >= highThreshold / 3) {
    return 'medium';
  }
  return 'low';
}
