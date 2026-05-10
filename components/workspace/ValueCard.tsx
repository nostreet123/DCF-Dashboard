'use client';

import { DistributionCurve } from '@/components/charts/DistributionCurve';
import { ScenarioChips, scenarioChipPresets } from './ScenarioChips';
import { formatCurrency } from '@/lib/utils/formatters';
import type { Assumptions } from '@/lib/workbench/scenarioProfiles';
import styles from './ValueCard.module.css';

type Scenario = 'base' | 'bull' | 'bear';

interface ValueCardProps {
  /** The fair value estimate */
  value: number;
  /** Current scenario */
  scenario: Scenario;
  /** Current assumptions for the active scenario */
  assumptions?: Assumptions;
  /** Histogram data for distribution curve */
  histogram?: {
    binCenters: number[];
    density: number[];
  };
  /** Company ticker */
  ticker?: string;
  /** Value range (low, high) */
  range?: [number, number];
  /** Filing/display currency */
  currency?: string | null;
  /** Optional USD-converted value */
  usdValue?: number | null;
  /** Optional USD-converted range */
  usdRange?: [number, number] | null;
  /** Whether the displayed valuation is being recomputed */
  isCalculating?: boolean;
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
  assumptions,
  histogram,
  ticker,
  range,
  currency = 'USD',
  usdValue,
  usdRange,
  isCalculating = false,
  className,
}: ValueCardProps) {
  const chips = assumptions
    ? [
        {
          ...scenarioChipPresets[scenario][0],
          value: formatChipPercent(assumptions.revenueGrowth),
        },
        {
          ...scenarioChipPresets[scenario][1],
          value: formatChipPercent(assumptions.operatingMargin),
        },
        {
          ...scenarioChipPresets[scenario][2],
          value: formatChipPercent(assumptions.discountRate, 2),
        },
      ]
    : scenarioChipPresets[scenario];
  const displayCurrency = currency || 'USD';
  const showUsd = displayCurrency !== 'USD' && typeof usdValue === 'number';

  return (
    <div className={`${styles.card} ${isCalculating ? styles.calculating : ''} ${className || ''}`}>
      <div className={styles.header}>
        <div className={styles.label}>
          {ticker ? `${ticker} Fair Value` : 'Fair Value Estimate'}
        </div>
        <div className={styles.scenarioLabel}>{scenario.toUpperCase()} CASE</div>
      </div>

      <div className={styles.body}>
        <div className={styles.valueColumn}>
          <div className={styles.valueContainer}>
            <span key={`${scenario}-${value}`} className={`${styles.value} ${styles.valueAnimated}`}>
              {formatCurrency(value, displayCurrency)}
            </span>
            {range && (
              <div key={`${scenario}-${range[0]}-${range[1]}`} className={`${styles.range} ${styles.rangeAnimated}`}>
                <span className={styles.rangeLabel}>MC P10-P90</span>
                <span className={styles.rangeValue}>{formatCurrency(range[0], displayCurrency)}</span>
                <span className={styles.rangeSeparator}>—</span>
                <span className={styles.rangeValue}>{formatCurrency(range[1], displayCurrency)}</span>
              </div>
            )}
            {showUsd ? (
              <div className={styles.usdLine}>
                USD {formatCurrency(usdValue ?? 0, 'USD')}
                {usdRange ? ` (${formatCurrency(usdRange[0], 'USD')} - ${formatCurrency(usdRange[1], 'USD')})` : ''}
              </div>
            ) : null}
          </div>

          <ScenarioChips chips={chips} className={styles.chips} />
        </div>

        {histogram && histogram.binCenters.length > 0 && (
          <div className={styles.chartPanel}>
            <div className={styles.chartCaption}>Histogram min/max</div>
            <DistributionCurve
              histogram={histogram}
              currentValue={value}
              p10={range?.[0]}
              p90={range?.[1]}
              width={460}
              height={154}
              className={styles.chart}
            />
          </div>
        )}
      </div>
      {isCalculating ? <div className={styles.calculatingLabel}>Recalculating scenario...</div> : null}
    </div>
  );
}

function formatChipPercent(value: number, maxFractionDigits = 1): string {
  const fixed = value.toFixed(maxFractionDigits);
  return `${fixed.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')}%`;
}
