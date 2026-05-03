'use client';

import type {
  KpiValue,
  MonteCarloSummary,
  StatementHistoryPoint,
  ValuationProvenance,
} from '@/lib/hooks/useDcfCompute';
import {
  formatCompactCurrency,
  formatCurrency,
  formatNumber,
} from '@/lib/utils/formatters';
import styles from './ValuationDetails.module.css';

interface ValuationDetailsProps {
  kpis?: KpiValue[];
  statementHistory?: StatementHistoryPoint[];
  monteCarloSummary?: MonteCarloSummary;
  provenance?: ValuationProvenance;
  className?: string;
}

const formatOptionalCurrency = (value: number | null | undefined): string =>
  typeof value === 'number' ? formatCompactCurrency(value) : '—';

const formatOptionalNumber = (value: number | null | undefined): string =>
  typeof value === 'number' ? formatNumber(value) : '—';

const formatKpiValue = (kpi: KpiValue): string => {
  if (kpi.value === null) {
    return '—';
  }
  if (kpi.unit === '%') {
    return `${kpi.value.toFixed(1)}%`;
  }
  if (kpi.unit === 'x') {
    return `${kpi.value.toFixed(1)}x`;
  }
  return formatOptionalNumber(kpi.value);
};

export function ValuationDetails({
  kpis = [],
  statementHistory = [],
  monteCarloSummary,
  provenance,
  className,
}: ValuationDetailsProps) {
  const hasKpis = kpis.length > 0;
  const hasHistory = statementHistory.length > 0;
  const hasProvenance =
    Boolean(provenance?.latestStatementSource) ||
    Boolean(provenance?.source) ||
    Boolean(provenance?.latestPeriodEnd) ||
    Boolean(provenance?.latestFilingDate);
  const hasMonteCarlo = Boolean(monteCarloSummary);

  if (!hasKpis && !hasHistory && !hasProvenance && !hasMonteCarlo) {
    return null;
  }

  return (
    <section className={`${styles.section} ${className || ''}`}>
      <div className={styles.header}>
        <h2 className={styles.title}>Valuation Detail</h2>
        <p className={styles.subtitle}>
          Engine output, filing context, and operating history for this run
        </p>
      </div>

      <div className={styles.grid}>
        {hasKpis ? (
          <article className={styles.panel}>
            <h3 className={styles.panelTitle}>KPI Strip</h3>
            <div className={styles.kpiGrid}>
              {kpis.slice(0, 4).map((kpi) => (
                <div key={kpi.key} className={styles.kpiItem}>
                  <span className={styles.kpiLabel}>{kpi.label}</span>
                  <span className={styles.kpiValue}>{formatKpiValue(kpi)}</span>
                  {typeof kpi.score === 'number' ? (
                    <span className={styles.kpiScore}>Score {Math.round(kpi.score)}</span>
                  ) : null}
                </div>
              ))}
            </div>
          </article>
        ) : null}

        {hasMonteCarlo && monteCarloSummary ? (
          <article className={styles.panel}>
            <h3 className={styles.panelTitle}>Monte Carlo</h3>
            <dl className={styles.statList}>
              <div>
                <dt>Runs</dt>
                <dd>{formatNumber(monteCarloSummary.runs)}</dd>
              </div>
              <div>
                <dt>Median</dt>
                <dd>{formatCurrency(monteCarloSummary.median)}</dd>
              </div>
              <div>
                <dt>P10 / P90</dt>
                <dd>
                  {formatCurrency(monteCarloSummary.p10)} / {formatCurrency(monteCarloSummary.p90)}
                </dd>
              </div>
            </dl>
          </article>
        ) : null}

        {hasProvenance && provenance ? (
          <article className={styles.panel}>
            <h3 className={styles.panelTitle}>Filing Provenance</h3>
            <dl className={styles.statList}>
              <div>
                <dt>Source</dt>
                <dd>{provenance.latestStatementSource ?? provenance.source ?? '—'}</dd>
              </div>
              <div>
                <dt>Period</dt>
                <dd>{provenance.latestPeriodEnd ?? '—'}</dd>
              </div>
              <div>
                <dt>Filing Date</dt>
                <dd>{provenance.latestFilingDate ?? '—'}</dd>
              </div>
            </dl>
          </article>
        ) : null}

        {hasHistory ? (
          <article className={`${styles.panel} ${styles.historyPanel}`}>
            <h3 className={styles.panelTitle}>Statement History</h3>
            <div className={styles.historyTableWrapper}>
              <table className={styles.historyTable}>
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Revenue</th>
                    <th>Cash</th>
                    <th>Debt</th>
                    <th>Shares</th>
                  </tr>
                </thead>
                <tbody>
                  {statementHistory.slice(0, 5).map((point) => (
                    <tr key={point.periodEnd}>
                      <th scope="row">{point.periodEnd}</th>
                      <td>{formatOptionalCurrency(point.revenue)}</td>
                      <td>{formatOptionalCurrency(point.cash)}</td>
                      <td>{formatOptionalCurrency(point.debt)}</td>
                      <td>{formatOptionalNumber(point.sharesOutstanding)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ) : null}
      </div>
    </section>
  );
}
