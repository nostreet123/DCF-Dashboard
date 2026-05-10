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
  /** Active scenario revenue growth in percentage points */
  baseGrowthRate?: number;
  /** Active scenario WACC in percentage points */
  baseWaccRate?: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Section containing the sensitivity analysis heatmap.
 * Includes section header and axis labels.
 */
export function SensitivitySection({
  data,
  growthOffsets = [-4, -3, -2, -1, 0, 1, 2, 3, 4],
  waccOffsets = [-4, -3, -2, -1, 0, 1, 2, 3, 4],
  baseGrowthRate,
  baseWaccRate,
  className,
}: SensitivitySectionProps) {
  // Default mock data if none provided
  const defaultData = [
    [130, 140, 151, 163, 176, 190, 205, 221, 238],
    [121, 130, 140, 151, 163, 176, 190, 205, 221],
    [112, 121, 130, 140, 151, 163, 176, 190, 205],
    [104, 112, 121, 130, 140, 151, 163, 176, 190],
    [97, 104, 112, 121, 130, 140, 151, 163, 176],
    [90, 97, 104, 112, 121, 130, 140, 151, 163],
    [84, 90, 97, 104, 112, 121, 130, 140, 151],
    [78, 84, 90, 97, 104, 112, 121, 130, 140],
    [72, 78, 84, 90, 97, 104, 112, 121, 130],
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
            baseGrowthRate={baseGrowthRate}
            baseWaccRate={baseWaccRate}
          />
        </div>
      </div>

      <div className={styles.xAxisLabel}>
        <span>Revenue Growth Rate</span>
      </div>
    </section>
  );
}
