import { Skeleton } from '@/components/ui/Skeleton';
import styles from './ValueCard.module.css';

/**
 * Loading skeleton for the ValueCard component.
 */
export function ValueCardSkeleton() {
  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <Skeleton width={120} height={16} />
        <Skeleton width={80} height={20} />
      </div>

      <div className={styles.valueContainer}>
        <Skeleton width={180} height={48} />
        <div className={styles.range} style={{ marginTop: '8px' }}>
          <Skeleton width={60} height={14} />
          <span style={{ width: 16 }} />
          <Skeleton width={60} height={14} />
        </div>
      </div>

      <div className={styles.chart}>
        <Skeleton width={320} height={80} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
        <Skeleton width={80} height={28} />
        <Skeleton width={80} height={28} />
        <Skeleton width={80} height={28} />
      </div>
    </div>
  );
}
