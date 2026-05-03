'use client';

import { useState } from 'react';
import { Sparkline } from '@/components/charts/Sparkline';
import { Pagination } from '@/components/ui/Pagination';
import type { ProjectionRow } from '@/lib/hooks/useDcfCompute';
import { formatCompactCurrency, formatPercent } from '@/lib/utils/formatters';
import styles from './MetricsTable.module.css';

interface MetricRow {
  id: string;
  label: string;
  year1: number | null;
  year2: number | null;
  year3: number | null;
  year4: number | null;
  year5: number | null;
  trend: number[];
  format?: 'currency' | 'percent' | 'number';
}

interface MetricsTableProps {
  /** Table rows */
  rows?: MetricRow[];
  /** Engine forecast rows */
  projections?: ProjectionRow[];
  /** Items per page */
  pageSize?: number;
  /** Additional CSS classes */
  className?: string;
}

type MetricFormat = MetricRow['format'];

const DEFAULT_PAGE_SIZE = 5;

const defaultRows: MetricRow[] = [
  {
    id: 'revenue',
    label: 'Revenue',
    year1: 394000000000,
    year2: 425000000000,
    year3: 460000000000,
    year4: 498000000000,
    year5: 540000000000,
    trend: [394, 410, 425, 445, 460, 475, 498, 515, 540],
    format: 'currency',
  },
  {
    id: 'gross-margin',
    label: 'Gross Margin',
    year1: 0.432,
    year2: 0.445,
    year3: 0.452,
    year4: 0.46,
    year5: 0.465,
    trend: [43.2, 43.8, 44.5, 44.8, 45.2, 45.5, 46.0, 46.2, 46.5],
    format: 'percent',
  },
  {
    id: 'operating-income',
    label: 'Operating Income',
    year1: 119000000000,
    year2: 132000000000,
    year3: 147000000000,
    year4: 162000000000,
    year5: 178000000000,
    trend: [119, 125, 132, 138, 147, 152, 162, 170, 178],
    format: 'currency',
  },
  {
    id: 'fcf',
    label: 'Free Cash Flow',
    year1: 99000000000,
    year2: 110000000000,
    year3: 122000000000,
    year4: 135000000000,
    year5: 148000000000,
    trend: [99, 104, 110, 115, 122, 128, 135, 142, 148],
    format: 'currency',
  },
  {
    id: 'capex',
    label: 'CapEx',
    year1: 11000000000,
    year2: 12000000000,
    year3: 13000000000,
    year4: 14000000000,
    year5: 15000000000,
    trend: [11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15],
    format: 'currency',
  },
];

function formatMetricValue(value: number | null, format?: MetricFormat): string {
  if (value === null) {
    return '—';
  }
  switch (format) {
    case 'currency':
      return formatCompactCurrency(value);
    case 'percent':
      return formatPercent(value);
    default:
      return value.toLocaleString();
  }
}

function getProjectionYears(currentYear: number = new Date().getFullYear()): number[] {
  return [currentYear + 1, currentYear + 2, currentYear + 3, currentYear + 4, currentYear + 5];
}

function rowsFromProjections(projections: ProjectionRow[]): MetricRow[] {
  const visible = projections.slice(0, 5);
  const valueAt = (
    key: keyof Pick<ProjectionRow, 'revenue' | 'ebit' | 'nopat' | 'freeCashFlow'>,
    index: number,
  ) => visible[index]?.[key] ?? null;
  const trendFor = (
    key: keyof Pick<ProjectionRow, 'revenue' | 'ebit' | 'nopat' | 'freeCashFlow'>,
  ) => projections.flatMap((row) => {
    const value = row[key];
    return typeof value === 'number' ? [value] : [];
  });

  return [
    {
      id: 'revenue',
      label: 'Revenue',
      year1: valueAt('revenue', 0),
      year2: valueAt('revenue', 1),
      year3: valueAt('revenue', 2),
      year4: valueAt('revenue', 3),
      year5: valueAt('revenue', 4),
      trend: trendFor('revenue'),
      format: 'currency',
    },
    {
      id: 'ebit',
      label: 'EBIT',
      year1: valueAt('ebit', 0),
      year2: valueAt('ebit', 1),
      year3: valueAt('ebit', 2),
      year4: valueAt('ebit', 3),
      year5: valueAt('ebit', 4),
      trend: trendFor('ebit'),
      format: 'currency',
    },
    {
      id: 'nopat',
      label: 'NOPAT',
      year1: valueAt('nopat', 0),
      year2: valueAt('nopat', 1),
      year3: valueAt('nopat', 2),
      year4: valueAt('nopat', 3),
      year5: valueAt('nopat', 4),
      trend: trendFor('nopat'),
      format: 'currency',
    },
    {
      id: 'fcff',
      label: 'Free Cash Flow',
      year1: valueAt('freeCashFlow', 0),
      year2: valueAt('freeCashFlow', 1),
      year3: valueAt('freeCashFlow', 2),
      year4: valueAt('freeCashFlow', 3),
      year5: valueAt('freeCashFlow', 4),
      trend: trendFor('freeCashFlow'),
      format: 'currency',
    },
  ];
}

/**
 * Paginated table displaying financial projections with sparkline trends.
 */
export function MetricsTable({
  rows,
  projections,
  pageSize = DEFAULT_PAGE_SIZE,
  className,
}: MetricsTableProps) {
  const tableRows = rows ?? (projections && projections.length > 0 ? rowsFromProjections(projections) : defaultRows);
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.ceil(tableRows.length / pageSize);

  const startIndex = (currentPage - 1) * pageSize;
  const visibleRows = tableRows.slice(startIndex, startIndex + pageSize);

  const projectionYears =
    projections && projections.length > 0
      ? Array.from({ length: 5 }, (_, index) => {
          const lastProjectionYear = projections[projections.length - 1]?.year ?? new Date().getFullYear();
          return projections[index]?.year ?? lastProjectionYear + index - projections.length + 1;
        })
      : getProjectionYears();

  return (
    <div className={`${styles.container} ${className || ''}`}>
      <div className={styles.header}>
        <h2 className={styles.title}>Financial Projections</h2>
      </div>

      <div className={styles.tableWrapper} aria-label="Financial projection table with horizontal scroll">
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={`${styles.metricHeader} ${styles.stickyMetric}`}>Metric</th>
              {projectionYears.map((year) => (
                <th key={year} scope="col" className={styles.yearHeader}>{year}</th>
              ))}
              <th scope="col" className={styles.trendHeader}>Trend</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id}>
                <th scope="row" className={`${styles.metricCell} ${styles.stickyMetric}`}>{row.label}</th>
                <td className={`${styles.valueCell} ${styles.numericCell}`}>{formatMetricValue(row.year1, row.format)}</td>
                <td className={`${styles.valueCell} ${styles.numericCell}`}>{formatMetricValue(row.year2, row.format)}</td>
                <td className={`${styles.valueCell} ${styles.numericCell}`}>{formatMetricValue(row.year3, row.format)}</td>
                <td className={`${styles.valueCell} ${styles.numericCell}`}>{formatMetricValue(row.year4, row.format)}</td>
                <td className={`${styles.valueCell} ${styles.numericCell}`}>{formatMetricValue(row.year5, row.format)}</td>
                <td className={styles.trendCell}>
                  <Sparkline
                    data={row.trend}
                    width={60}
                    height={24}
                    strokeWidth={1.5}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </div>
      )}
    </div>
  );
}
