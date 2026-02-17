'use client';

import { DistributionCurve } from '@/components/charts/DistributionCurve';
import { ScenarioChips, scenarioChipPresets } from './ScenarioChips';
import { formatCurrency } from '@/lib/utils/formatters';
import styles from './ValueCard.module.css';

type Scenario = 'base' | 'bull' | 'bear';

interface ValueCardProps {
  /** The fair value estimate */
  value: number;
  /** Current scenario */
  scenario: Scenario;
  /** Histogram data for distribution curve */
  histogram?: {
    binCenters: number[];
    density: number[];
  };
  /** Company ticker */
  ticker?: string;
  /** Value range (low, high) */
  range?: [number, number];
  /** Additional CSS classes */
  className?: string;
}

/**
 * Hero value card showing the main DCF valuation result.
 * Displays the value in gold, distribution curve, and scenario chips.
 */
export function ValueCard({
  value,
  scenario,
  histogram,
  ticker,
  range,
  className,
}: ValueCardProps) {
  const chips = scenarioChipPresets[scenario];

  return (
    <div className={`${styles.card} ${className || ''}`}>
      <div className={styles.header}>
        <div className={styles.label}>
          {ticker ? `${ticker} Fair Value` : 'Fair Value Estimate'}
        </div>
        <div className={styles.scenarioLabel}>{scenario.toUpperCase()} CASE</div>
      </div>

      <div className={styles.valueContainer}>
        <span key={`${scenario}-${value}`} className={`${styles.value} ${styles.valueAnimated}`}>
          {formatCurrency(value)}
        </span>
        {range && (
          <div key={`${scenario}-${range[0]}-${range[1]}`} className={`${styles.range} ${styles.rangeAnimated}`}>
            <span className={styles.rangeValue}>{formatCurrency(range[0])}</span>
            <span className={styles.rangeSeparator}>—</span>
            <span className={styles.rangeValue}>{formatCurrency(range[1])}</span>
          </div>
        )}
      </div>

      {histogram && histogram.binCenters.length > 0 && (
        <div className={styles.chart}>
          <DistributionCurve
            histogram={histogram}
            currentValue={value}
            width={320}
            height={80}
          />
        </div>
      )}

      <ScenarioChips chips={chips} className={styles.chips} />
    </div>
  );
}
