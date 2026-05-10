'use client';

import styles from './ModeToggle.module.css';

type Mode = 'workbench' | 'investor';

interface ModeToggleProps {
  /** Current mode */
  value: Mode;
  /** Change handler */
  onChange?: (mode: Mode) => void;
  /** Additional CSS classes */
  className?: string;
  /** Custom labels */
  labels?: {
    workbench: string;
    investor: string;
  };
  /** Modes that are present but currently unavailable */
  disabledModes?: Partial<Record<Mode, boolean>>;
  /** Optional short status text rendered inside the segment */
  statusLabels?: Partial<Record<Mode, string>>;
}

/**
 * Segmented control for switching between Workbench and Investor View modes.
 */
export function ModeToggle({
  value,
  onChange,
  className,
  labels = { workbench: 'Workbench', investor: 'Investor View' },
  disabledModes,
  statusLabels,
}: ModeToggleProps) {
  const modes: Mode[] = ['workbench', 'investor'];

  return (
    <div className={`${styles.container} ${className || ''}`}>
      {modes.map((mode) => {
        const isDisabled = Boolean(disabledModes?.[mode]);
        const statusLabel = statusLabels?.[mode];
        const label = labels[mode];

        return (
          <button
            key={mode}
            type="button"
            className={`${styles.segment} ${value === mode ? styles.active : ''}`}
            onClick={() => onChange?.(mode)}
            aria-pressed={value === mode}
            aria-label={isDisabled && statusLabel ? `${label}, ${statusLabel}` : label}
            disabled={isDisabled}
          >
            <span>{label}</span>
            {statusLabel ? <span className={styles.status}>{statusLabel}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
