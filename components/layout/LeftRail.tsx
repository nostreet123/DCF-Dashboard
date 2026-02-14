'use client';

import { Accordion, AccordionItem } from '@/components/ui/Accordion';
import styles from './LeftRail.module.css';

interface DatasetItem {
  id: string;
  name: string;
  ticker: string;
}

interface RunHistoryItem {
  id: string;
  timestamp: Date;
  ticker: string;
  value: number;
}

interface LeftRailProps {
  /** Grouped datasets by category */
  datasets?: Record<string, DatasetItem[]>;
  /** Recent valuation runs */
  runHistory?: RunHistoryItem[];
  /** Currently selected company ID */
  selectedCompanyId?: string;
  /** Company selection callback */
  onSelectCompany?: (id: string) => void;
  /** Run history selection callback */
  onSelectRun?: (id: string) => void;
  /** Layout variant */
  variant?: 'docked' | 'drawer';
}

/**
 * Left sidebar with dataset library, region selector, and run history.
 * 240px fixed width.
 */
export function LeftRail({
  datasets,
  runHistory,
  selectedCompanyId,
  onSelectCompany,
  onSelectRun,
  variant = 'docked',
}: LeftRailProps) {
  const railClass =
    variant === 'drawer'
      ? `${styles.rail} ${styles.drawer}`
      : `${styles.rail} ${styles.docked}`;

  return (
    <aside className={railClass}>
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Dataset Library</h3>
        <Accordion>
          {datasets ? (
            Object.entries(datasets).map(([category, items]) => (
              <AccordionItem
                key={category}
                title={category}
                badge={items.length}
                defaultOpen={category === 'Technology'}
              >
                <ul className={styles.companyList}>
                  {items.map((item) => (
                    <li key={item.id}>
                      <button
                        className={`${styles.companyItem} ${
                          selectedCompanyId === item.id ? styles.selected : ''
                        }`}
                        onClick={() => onSelectCompany?.(item.id)}
                      >
                        <span className={styles.companyTicker}>{item.ticker}</span>
                        <span className={styles.companyName}>{item.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </AccordionItem>
            ))
          ) : (
            <div className={styles.empty}>No datasets loaded</div>
          )}
        </Accordion>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Region</h3>
        <div className={styles.regionSelector}>
          <button className={`${styles.regionBtn} ${styles.active}`}>US</button>
          <button className={styles.regionBtn}>EU</button>
          <button className={styles.regionBtn}>APAC</button>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Run History</h3>
        {runHistory && runHistory.length > 0 ? (
          <ul className={styles.historyList}>
            {runHistory.slice(0, 5).map((run) => (
              <li key={run.id}>
                <button
                  className={styles.historyItem}
                  onClick={() => onSelectRun?.(run.id)}
                >
                  <div className={styles.historyTop}>
                    <span className={styles.historyTicker}>{run.ticker}</span>
                    <span className={styles.historyValue}>
                      ${run.value.toFixed(2)}
                    </span>
                  </div>
                  <span className={styles.historyTime}>
                    {formatRelativeTime(run.timestamp)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.empty}>No recent runs</div>
        )}
      </div>
    </aside>
  );
}

/**
 * Format a date as relative time (e.g., "2 hours ago")
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
