import type { ReactNode } from 'react';
import Link from 'next/link';

import { LAB_PATHS } from '@/lib/lab/presentation';
import styles from './states.module.css';

export function ComputingMemo({
  companyLabel,
  shortName,
}: {
  companyLabel: string;
  shortName: string;
}) {
  return (
    <section className={styles.page} aria-label="Computing">
      <span className={styles.eyebrow}>01 · Computing a memo</span>
      <div className={`${styles.card} ${styles.computing}`}>
        <div className={styles.kicker}>
          <span className={styles.accent}>Valuation memo</span>
          <span aria-hidden="true">·</span>
          <span>{companyLabel}</span>
        </div>
        <p className={styles.computingTitle} role="status">
          Working out what {shortName} is worth…
        </p>
        <div className={`${styles.bar} ${styles.barWide}`} />
        <div className={`${styles.bar} ${styles.barMid}`} />
        <div className={`${styles.bar} ${styles.barShort}`} />
        <div className={styles.steps}>
          <span className={styles.step}>
            <span className={styles.dot} />
            Statements loaded
          </span>
          <span className={styles.step}>
            <span className={styles.dot} />
            Projecting five years
          </span>
          <span className={`${styles.step} ${styles.stepPending}`}>
            <span className={`${styles.dot} ${styles.dotPending}`} />
            Discounting and sensitivity
          </span>
        </div>
      </div>
    </section>
  );
}

export function ImportMemo({
  ticker,
  name,
  onImport,
  reviewing,
  review,
}: {
  ticker: string;
  name: string;
  onImport?: () => void;
  reviewing?: boolean;
  review?: ReactNode;
}) {
  const shortName = name.replace(/\s+(Inc\.|Corp\.|Corporation)$/i, '');
  return (
    <section className={styles.page} aria-label="Import needed">
      <span className={styles.eyebrow}>02 · Company not in the library yet</span>
      <div className={styles.card}>
        <div className={styles.kicker}>
          <span className={styles.accent}>Import</span>
          <span aria-hidden="true"> · </span>
          <span>
            {ticker} · {name}
          </span>
        </div>
        <h1 className={styles.title}>We haven&apos;t modeled {shortName} yet.</h1>
        <p className={styles.copy}>
          Importing pulls its reported revenue, cash, debt and share count from SEC filings. You review the figures before anything is saved.
        </p>
        <div className={styles.actions}>
          {onImport ? (
            <button type="button" className={styles.primary} onClick={onImport}>
              Import and review
            </button>
          ) : (
            <Link href={`${LAB_PATHS.memo}?status=import&ticker=${encodeURIComponent(ticker)}&name=${encodeURIComponent(name)}`} className={styles.primary}>
              Import and review
            </Link>
          )}
          <Link href={LAB_PATHS.library} className={styles.secondary}>
            Back to library
          </Link>
        </div>
        {reviewing ? review : null}
      </div>
    </section>
  );
}

export function UnavailableMemo({
  savedLabel,
  onRetry,
  errorMessage,
}: {
  savedLabel: string;
  onRetry: () => void;
  errorMessage?: string;
}) {
  return (
    <section className={styles.page} aria-label="Valuation error">
      <span className={styles.eyebrow}>03 · Valuation unavailable</span>
      <div className={`${styles.card} ${styles.alert}`} role="alert">
        <div className={`${styles.kicker} ${styles.alertKicker}`}>Unable to finish this memo</div>
        <h1 className={styles.title}>This memo could not be calculated.</h1>
        {errorMessage ? <p className={styles.copy}>{errorMessage}</p> : null}
        <p className={styles.copy}>
          Your assumptions are kept. Check the reported data and try again, or {savedLabel}.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={onRetry}>
            Try again
          </button>
          <Link href={LAB_PATHS.history} className={styles.secondary}>
            Open saved memo
          </Link>
        </div>
      </div>
    </section>
  );
}
