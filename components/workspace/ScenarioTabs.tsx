'use client';

import styles from './ScenarioTabs.module.css';

type Scenario = 'base' | 'bull' | 'bear';

interface ScenarioTabsProps {
  /** Currently active scenario */
  value: Scenario;
  /** Scenario change callback */
  onChange: (scenario: Scenario) => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Tab navigation for switching between Base, Bull, and Bear scenarios.
 */
export function ScenarioTabs({ value, onChange, className }: ScenarioTabsProps) {
  return (
    <div className={`${styles.tabs} ${className || ''}`}>
      <button
        className={`${styles.tab} ${value === 'bear' ? styles.active : ''} ${styles.bear}`}
        onClick={() => onChange('bear')}
        aria-pressed={value === 'bear'}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 3L4 10H12L8 3Z" fill="currentColor" transform="rotate(180 8 8)" />
        </svg>
        Bear
      </button>
      <button
        className={`${styles.tab} ${value === 'base' ? styles.active : ''} ${styles.base}`}
        onClick={() => onChange('base')}
        aria-pressed={value === 'base'}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="4" y="6" width="8" height="4" rx="1" fill="currentColor" />
        </svg>
        Base
      </button>
      <button
        className={`${styles.tab} ${value === 'bull' ? styles.active : ''} ${styles.bull}`}
        onClick={() => onChange('bull')}
        aria-pressed={value === 'bull'}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 3L4 10H12L8 3Z" fill="currentColor" />
        </svg>
        Bull
      </button>
    </div>
  );
}
