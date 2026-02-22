'use client';

import styles from './ScenarioChips.module.css';

interface ScenarioChip {
  label: string;
  value: string;
  direction: 'up' | 'down' | 'neutral';
}

interface ScenarioChipsProps {
  /** Chips to display */
  chips: ScenarioChip[];
  /** Additional CSS classes */
  className?: string;
}

/**
 * Display chips showing key scenario assumptions with directional arrows.
 */
export function ScenarioChips({ chips, className }: ScenarioChipsProps) {
  return (
    <div className={`${styles.container} ${className || ''}`}>
      {chips.map((chip, i) => (
        <div key={i} className={styles.chip}>
          <span className={styles.label}>{chip.label}</span>
          <span className={`${styles.value} ${styles[chip.direction]}`}>
            {chip.direction === 'up' && '↑'}
            {chip.direction === 'down' && '↓'}
            {chip.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Default chips for each scenario type.
 */
export const scenarioChipPresets = {
  base: [
    { label: 'Growth', value: '12%', direction: 'neutral' as const },
    { label: 'Margin', value: '25%', direction: 'neutral' as const },
    { label: 'WACC', value: '10%', direction: 'neutral' as const },
  ],
  bull: [
    { label: 'Growth', value: '18%', direction: 'up' as const },
    { label: 'Margin', value: '30%', direction: 'up' as const },
    { label: 'WACC', value: '8%', direction: 'down' as const },
  ],
  bear: [
    { label: 'Growth', value: '6%', direction: 'down' as const },
    { label: 'Margin', value: '18%', direction: 'down' as const },
    { label: 'WACC', value: '14%', direction: 'up' as const },
  ],
};
