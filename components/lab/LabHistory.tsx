'use client';

import { useState } from 'react';
import Link from 'next/link';

import { LabFrame } from '@/components/lab/LabFrame';
import {
  buildDemoHistory,
  demoDisclaimer,
  formatAssumptionPercent,
  formatLabDate,
  formatLabDay,
  formatLabTime,
  formatSharePrice,
  LAB_PATHS,
} from '@/lib/lab/presentation';
import { cn } from '@/lib/utils/cn';
import styles from './history.module.css';

export function LabHistory() {
  const runs = buildDemoHistory();
  const [selectedId, setSelectedId] = useState(runs[0]?.id ?? '');
  const selected = runs.find((run) => run.id === selectedId) ?? runs[0];

  return (
    <LabFrame active="history">
      <div className={styles.page}>
        <section className={styles.intro}>
          <div className={styles.kicker}>Run history</div>
          <h1 className={styles.title}>Every memo you&apos;ve saved.</h1>
          <p className={styles.lede}>
            Each run keeps its assumptions and result, so you can reopen it exactly as it was or rerun it on today&apos;s data.
          </p>
        </section>

        <div className={styles.columns}>
          <section className={styles.runs} aria-label="Saved runs">
            {runs.length === 0 ? <p className={styles.empty}>No saved runs yet.</p> : null}
            {runs.map((run) => {
              const selectedRun = run.id === selected?.id;
              return (
                <button
                  key={run.id}
                  type="button"
                  className={cn(styles.run, selectedRun && styles.runSelected)}
                  aria-pressed={selectedRun}
                  onClick={() => setSelectedId(run.id)}
                >
                  <span className={styles.when}>
                    <span>{formatLabDay(run.at)}</span>
                    <span>{formatLabTime(run.at)}</span>
                  </span>
                  <span className={styles.identity}>
                    <span className={styles.runName}>{run.name}</span>
                    <span className={styles.runMeta}>
                      {run.ticker} · {run.scenarioLabel}
                    </span>
                  </span>
                  <span className={styles.runValue}>{formatSharePrice(run.value)}</span>
                </button>
              );
            })}
            {runs.length > 0 ? <p className={styles.note}>Showing all {runs.length} saved runs.</p> : null}
          </section>

          {selected ? (
            <article className={styles.preview} aria-label="Run preview">
              <div className={styles.previewKicker}>
                Saved {formatLabDate(selected.at)} · {selected.ticker} · {selected.scenarioLabel}
              </div>
              <h2 className={styles.previewTitle}>
                {selected.shortName} looked worth <span className={styles.accent}>{formatSharePrice(selected.value)}</span> a share.
              </h2>
              {selected.assumptions ? (
                <p className={styles.previewCopy}>
                  That memo assumed revenue growth of <span className={styles.accent}>{formatAssumptionPercent(selected.assumptions.revenueGrowth, 'growth')}</span> a year at a <span className={styles.accent}>{formatAssumptionPercent(selected.assumptions.operatingMargin, 'margin')}</span> operating margin, discounted at <span className={styles.accent}>{formatAssumptionPercent(selected.assumptions.discountRate, 'discount')}</span>, with <span className={styles.accent}>{formatAssumptionPercent(selected.assumptions.terminalGrowth, 'terminal')}</span> terminal growth.
                </p>
              ) : (
                <p className={styles.previewCopy}>
                  The assumptions behind this run are stored with it. Open it to read the full memo.
                </p>
              )}
              <div className={styles.actions}>
                <Link href={`${LAB_PATHS.memo}?run=${encodeURIComponent(selected.id)}`} className={styles.primary}>
                  Open this memo
                </Link>
                <Link
                  href={`${LAB_PATHS.memo}?rerun=1&ticker=${encodeURIComponent(selected.ticker)}&run=${encodeURIComponent(selected.id)}`}
                  className={styles.secondary}
                >
                  Rerun on today&apos;s data
                </Link>
              </div>
            </article>
          ) : null}
        </div>

        <footer className={styles.footer}>{demoDisclaimer('Demo runs.')}</footer>
      </div>
    </LabFrame>
  );
}
