'use client';

import { Slider } from '@/components/ui/Slider';
import { createDefaultAssumptions, type Assumptions } from '@/lib/workbench/scenarioProfiles';
import styles from './RightPanel.module.css';

interface SensitivityDriver {
  name: string;
  impact: 'high' | 'medium' | 'low';
  direction: 'positive' | 'negative';
}

interface RightPanelProps {
  /** Current assumption values */
  assumptions?: Assumptions;
  /** Assumption change callback */
  onAssumptionChange?: (key: keyof Assumptions, value: number) => void;
  /** Sensitivity drivers */
  drivers?: SensitivityDriver[];
  /** Whether calculation is in progress */
  isCalculating?: boolean;
  /** Layout variant */
  variant?: 'docked' | 'drawer';
}

/**
 * Right sidebar with assumption sliders and sensitivity drivers.
 * 300px fixed width.
 */
export function RightPanel({
  assumptions = createDefaultAssumptions(),
  onAssumptionChange,
  drivers,
  isCalculating,
  variant = 'docked',
}: RightPanelProps) {
  const panelClass =
    variant === 'drawer'
      ? `${styles.panel} ${styles.drawer}`
      : `${styles.panel} ${styles.docked}`;

  return (
    <aside className={panelClass}>
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Assumptions</h3>
        <div className={styles.sliders}>
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
            max={50}
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
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>What Drives the Range</h3>
        {drivers && drivers.length > 0 ? (
          <ul className={styles.driverList}>
            {drivers.map((driver, i) => (
              <li key={i} className={styles.driverItem}>
                <span className={styles.driverName}>{driver.name}</span>
                <div className={styles.driverMeta}>
                  <span className={`${styles.driverImpact} ${styles[driver.impact]}`}>
                    {driver.impact}
                  </span>
                  <span className={styles.driverArrow}>
                    {driver.direction === 'positive' ? '↑' : '↓'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.driverList}>
            <div className={styles.driverItem}>
              <span className={styles.driverName}>Revenue Growth</span>
              <div className={styles.driverMeta}>
                <span className={`${styles.driverImpact} ${styles.high}`}>high</span>
                <span className={styles.driverArrow}>↑</span>
              </div>
            </div>
            <div className={styles.driverItem}>
              <span className={styles.driverName}>Discount Rate</span>
              <div className={styles.driverMeta}>
                <span className={`${styles.driverImpact} ${styles.high}`}>high</span>
                <span className={styles.driverArrow}>↓</span>
              </div>
            </div>
            <div className={styles.driverItem}>
              <span className={styles.driverName}>Operating Margin</span>
              <div className={styles.driverMeta}>
                <span className={`${styles.driverImpact} ${styles.medium}`}>medium</span>
                <span className={styles.driverArrow}>↑</span>
              </div>
            </div>
            <div className={styles.driverItem}>
              <span className={styles.driverName}>Terminal Growth</span>
              <div className={styles.driverMeta}>
                <span className={`${styles.driverImpact} ${styles.low}`}>low</span>
                <span className={styles.driverArrow}>↑</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {isCalculating && (
        <div className={styles.calculating}>
          <div className={styles.spinner} />
          <span>Recalculating...</span>
        </div>
      )}
    </aside>
  );
}
