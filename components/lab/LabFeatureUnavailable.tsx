import Link from 'next/link';
import { LabFrame } from './LabFrame';
import { LAB_PATHS, type LabScreen } from '@/lib/lab/presentation';
import styles from './states.module.css';

export function LabFeatureUnavailable({ active, title, description }: {
  active: LabScreen;
  title: string;
  description: string;
}) {
  return (
    <LabFrame active={active} tone="status">
      <section className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.copy}>{description}</p>
          <div className={styles.actions}>
            <Link href={LAB_PATHS.workbench} className={styles.primary}>Open workbench</Link>
            <Link href={LAB_PATHS.memo} className={styles.secondary}>Back to memo</Link>
          </div>
        </div>
      </section>
    </LabFrame>
  );
}
