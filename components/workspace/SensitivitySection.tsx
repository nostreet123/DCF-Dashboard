'use client';

import { SensitivityHeatmap } from '@/components/charts/SensitivityHeatmap';
import styles from './SensitivitySection.module.css';

interface SensitivitySectionProps {
  /** 2D array of sensitivity values */
  data?: number[][];
  /** Growth rate offsets */
  growthOffsets?: number[];
  /** WACC offsets */
  waccOffsets?: number[];
  /** Additional CSS classes */
  className?: string;
}

/**
 * Section containing the sensitivity analysis heatmap.
 * Includes section header and axis labels.
 */
export function SensitivitySection({
  data,
  growthOffsets = [-2, -1, 0, 1, 2],
  waccOffsets = [-2, -1, 0, 1, 2],
  className,
}: SensitivitySectionProps) {
  // Default mock data if none provided
  const defaultData = [
    [95, 105, 115, 125, 135],
    [105, 118, 130, 142, 155],
    [115, 130, 145, 160, 175],
    [125, 142, 160, 178, 195],
    [135, 155, 175, 195, 215],
  ];

  const sensitivityData = data || defaultData;

  return (
    <section className={`${styles.section} ${className || ''}`}>
      <div className={styles.header}>
        <h2 className={styles.title}>Sensitivity Analysis</h2>
        <p className={styles.subtitle}>
          How valuation changes with growth and discount rate assumptions
        </p>
      </div>

      <div className={styles.content}>
        <div className={styles.yAxisLabel}>
          <span>WACC</span>
        </div>
        <div className={styles.heatmapContainer}>
          <SensitivityHeatmap
            data={sensitivityData}
            growthOffsets={growthOffsets}
            waccOffsets={waccOffsets}
          />
        </div>
      </div>

      <div className={styles.xAxisLabel}>
        <span>Revenue Growth Rate</span>
      </div>
    </section>
  );
}
