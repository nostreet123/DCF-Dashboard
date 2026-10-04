'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

import { LabFrame } from '@/components/lab/LabFrame';
import { LabFeatureUnavailable } from './LabFeatureUnavailable';
import { SearchIcon } from '@/components/lab/icons';
import { getDashboardDataMode } from '@/lib/dashboardDataMode';
import {
  buildLibraryCatalog,
  demoDisclaimer,
  filterLibrary,
  formatLastMemo,
  LAB_PATHS,
  libraryAction,
  type LibraryFilter,
} from '@/lib/lab/presentation';
import { cn } from '@/lib/utils/cn';
import styles from './library.module.css';

const FILTERS: Array<{ id: LibraryFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'ready', label: 'Ready' },
  { id: 'import', label: 'Needs import' },
];

export function LabLibrary() {
  const isDemo = getDashboardDataMode() === 'demo';
  const companies = useMemo(() => isDemo ? buildLibraryCatalog() : [], [isDemo]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const shown = filterLibrary(companies, query, filter);
  const trimmed = query.trim();

  if (!isDemo) {
    return <LabFeatureUnavailable active="library" title="The live library is in the workbench"
      description="Search live companies and check their statement coverage in the workbench." />;
  }

  return (
    <LabFrame active="library">
      <div className={styles.page}>
        <section className={styles.intro}>
          <div className={styles.kicker}>Library</div>
          <h1 className={styles.title}>Pick a company to write a memo on.</h1>
          <p className={styles.lede}>
            Apple has a complete illustrative memo. Other demo companies do not have memo snapshots. Use the live workbench to value or import another company.
          </p>
        </section>

        <div className={styles.tools}>
          <label className={styles.search} htmlFor="lib-q">
            <SearchIcon />
            <span className={styles.visuallyHidden}>Search companies</span>
            <input
              id="lib-q"
              className={styles.searchInput}
              type="search"
              placeholder="Search by ticker or name"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className={styles.filters} role="group" aria-label="Coverage">
            {FILTERS.map((item) => {
              const count = filterLibrary(companies, query, item.id).length;
              const selected = filter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={cn(styles.filter, selected && styles.filterSelected)}
                  aria-pressed={selected}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label} <span className={styles.count}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <section aria-label="Companies">
          <div className={styles.head}>
            <span>Ticker</span>
            <span>Company</span>
            <span className={styles.hideSmall}>Sector</span>
            <span className={styles.hideSmall}>Last memo</span>
            <span>Status</span>
          </div>
          {shown.map((company) => {
            const action = libraryAction(company);
            const href = company.ready
              ? `${LAB_PATHS.memo}?ticker=${encodeURIComponent(company.ticker)}`
              : `${LAB_PATHS.memo}?status=import&ticker=${encodeURIComponent(company.ticker)}&name=${encodeURIComponent(company.name)}`;
            return (
              <div key={company.id} className={styles.row}>
                <span className={styles.ticker}>{company.ticker}</span>
                <span className={styles.name}>{company.name}</span>
                <span className={`${styles.muted} ${styles.hideSmall}`}>{company.sector}</span>
                <span className={`${styles.last} ${styles.hideSmall}`}>{formatLastMemo(company)}</span>
                <span className={styles.status}>
                  {company.ready ? <Link href={href} className={styles.action}>
                    {action}
                  </Link> : <span className={styles.muted}>Demo unavailable</span>}
                </span>
              </div>
            );
          })}
          {shown.length === 0 && trimmed.length > 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyTitle}>Nothing in the library matches “{trimmed}”.</span>
              <span className={styles.emptyCopy}>
                It may still be in SEC filings. Search there and import its statements to start a memo.
              </span>
              <Link
                href={`${LAB_PATHS.memo}?status=import&ticker=${encodeURIComponent(trimmed.toUpperCase())}&name=${encodeURIComponent(trimmed)}`}
                className={styles.sec}
              >
                Search SEC filings
              </Link>
            </div>
          ) : null}
        </section>

        <footer className={styles.footer}>{demoDisclaimer('Demo library.')}</footer>
      </div>
    </LabFrame>
  );
}
