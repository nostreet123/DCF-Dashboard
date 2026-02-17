import { Skeleton } from '@/components/ui/Skeleton';
import styles from './MetricsTable.module.css';

interface MetricsTableSkeletonProps {
  rows?: number;
}

/**
 * Loading skeleton for the MetricsTable component.
 */
export function MetricsTableSkeleton({ rows = 5 }: MetricsTableSkeletonProps) {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Skeleton width={180} height={20} />
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.metricHeader}>
                <Skeleton width={60} height={12} />
              </th>
              {[1, 2, 3, 4, 5].map((i) => (
                <th key={i} className={styles.yearHeader}>
                  <Skeleton width={40} height={12} />
                </th>
              ))}
              <th className={styles.trendHeader}>
                <Skeleton width={40} height={12} />
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <tr key={rowIndex}>
                <td className={styles.metricCell}>
                  <Skeleton width={100 + Math.random() * 40} height={14} />
                </td>
                {[1, 2, 3, 4, 5].map((i) => (
                  <td key={i} className={styles.valueCell}>
                    <Skeleton width={50} height={14} />
                  </td>
                ))}
                <td className={styles.trendCell}>
                  <Skeleton width={60} height={24} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
