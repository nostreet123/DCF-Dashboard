'use client';

import styles from './ModeToggle.module.css';

type Mode = 'workbench' | 'investor';

interface ModeToggleProps {
  /** Current mode */
  value: Mode;
  /** Change handler */
  onChange: (mode: Mode) => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Segmented control for switching between Workbench and Investor View modes.
 */
export function ModeToggle({ value, onChange, className }: ModeToggleProps) {
  return (
    <div className={`${styles.container} ${className || ''}`}>
      <button
        className={`${styles.segment} ${value === 'workbench' ? styles.active : ''}`}
        onClick={() => onChange('workbench')}
        aria-pressed={value === 'workbench'}
      >
        Workbench
      </button>
      <button
        className={`${styles.segment} ${value === 'investor' ? styles.active : ''}`}
        onClick={() => onChange('investor')}
        aria-pressed={value === 'investor'}
      >
        Investor View
      </button>
    </div>
  );
}
