import { Skeleton } from '@/components/ui/Skeleton';
import styles from './SensitivitySection.module.css';

export function SensitivitySectionSkeleton() {
  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <Skeleton width={220} height={26} />
        <Skeleton width="60%" height={16} />
      </div>
      <div style={{ display: 'grid', placeItems: 'center' }}>
        <Skeleton width={380} height={300} />
      </div>
    </section>
  );
}
