'use client';

import { scenarioChipPresets, type ScenarioChip } from '@/lib/workbench/scenarioProfiles';
import styles from './ScenarioChips.module.css';

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

export { scenarioChipPresets };
