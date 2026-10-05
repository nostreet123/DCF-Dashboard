'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';

import { LabFrame } from '@/components/lab/LabFrame';
import { SearchIcon } from '@/components/lab/icons';
import type { CompanySearchResult } from '@/lib/contracts/company';
import { getDashboardDataMode } from '@/lib/dashboardDataMode';
import {
  buildLibraryCatalog,
  companyFromSearch,
  demoDisclaimer,
  filterLibrary,
  formatLastMemo,
  LAB_PATHS,
  libraryAction,
  libraryMemoHref,
  type LabCompany,
  type LibraryFilter,
} from '@/lib/lab/presentation';
import { readRecentCompanies, rememberRecentCompany } from '@/lib/lab/recentCompanies';
import { getServerSessionRuns, readSessionRuns, subscribeSessionRuns } from '@/lib/lab/sessionRuns';
import { cn } from '@/lib/utils/cn';
import styles from './library.module.css';

const FILTERS: Array<{ id: LibraryFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'ready', label: 'Ready' },
  { id: 'import', label: 'Needs import' },
];

export function LabLibrary() {
  const isDemo = getDashboardDataMode() === 'demo';
  if (isDemo) {
    return <DemoLibrary />;
  }
  return <LiveLibrary />;
}

function DemoLibrary() {
  const companies = useMemo(() => buildLibraryCatalog(), []);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const shown = filterLibrary(companies, query, filter);
  const trimmed = query.trim();

  return (
    <LibraryPage
      lede="Apple has a complete illustrative memo. Other names in this demo list do not have snapshots."
      companies={companies}
      shown={shown}
      query={query}
      trimmed={trimmed}
      filter={filter}
      onQuery={setQuery}
      onFilter={setFilter}
      footer={demoDisclaimer('Demo library.')}
      countQuery={query}
      hrefFor={(company) =>
        company.ready
          ? `${LAB_PATHS.memo}?ticker=${encodeURIComponent(company.ticker)}`
          : `${LAB_PATHS.memo}?status=import&ticker=${encodeURIComponent(company.ticker)}&name=${encodeURIComponent(company.name)}`
      }
      actionFor={(company) => (company.ready ? libraryAction(company) : 'Demo unavailable')}
      linkAction={(company) => company.ready}
    />
  );
}

function LiveLibrary() {
  const sessionRuns = useSyncExternalStore(subscribeSessionRuns, readSessionRuns, getServerSessionRuns);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [results, setResults] = useState<CompanySearchResult[]>([]);
  const [recent, setRecent] = useState<CompanySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const trimmed = query.trim();

  useEffect(() => {
    setRecent(readRecentCompanies());
  }, []);

  useEffect(() => {
    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      setFeedback(null);
      return;
    }
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setSearching(true);
      setFeedback(null);
      void fetch(`/api/company/search?q=${encodeURIComponent(trimmed)}&limit=20`, {
        method: 'GET',
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => ({}))) as {
            message?: string;
            results?: CompanySearchResult[];
          };
          if (!response.ok) {
            throw new Error(payload.message ?? `Search failed (${response.status})`);
          }
          setResults(payload.results ?? []);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return;
          }
          setResults([]);
          setFeedback(error instanceof Error ? error.message : 'Company search failed.');
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setSearching(false);
          }
        });
    }, 250);
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [trimmed]);

  const source = trimmed.length >= 2 ? results : recent;
  const companies = source.map((company) => {
    const entry = companyFromSearch(company);
    const latest = sessionRuns.find((run) => run.ticker === entry.ticker);
    if (!latest) {
      return entry;
    }
    return { ...entry, lastValue: latest.value, lastAt: new Date(latest.at) };
  });
  const shown = filterLibrary(companies, '', filter);

  return (
    <LibraryPage
      lede="Companies marked ready have statements loaded and can be valued right away. Anything else can be imported from its SEC filings first."
      companies={companies}
      shown={shown}
      query={query}
      trimmed={trimmed}
      filter={filter}
      onQuery={setQuery}
      onFilter={setFilter}
      footer="Search uses the same company coverage as the valuation engine. For financial modeling and education only; not investment advice."
      hrefFor={libraryMemoHref}
      actionFor={libraryAction}
      linkAction={() => true}
      status={searching ? 'Searching companies…' : feedback}
      emptyPrompt={trimmed.length < 2 ? 'Search by ticker or name. Recent companies you have opened show up here.' : null}
      onOpen={(company) => {
        const match = source.find((item) => item.id === company.id);
        if (match) {
          setRecent(rememberRecentCompany(match));
        }
      }}
    />
  );
}

function LibraryPage({
  lede,
  companies,
  shown,
  query,
  trimmed,
  filter,
  onQuery,
  onFilter,
  footer,
  countQuery = '',
  hrefFor,
  actionFor,
  linkAction,
  status,
  emptyPrompt,
  onOpen,
}: {
  lede: string;
  companies: LabCompany[];
  shown: LabCompany[];
  query: string;
  trimmed: string;
  filter: LibraryFilter;
  onQuery: (value: string) => void;
  onFilter: (value: LibraryFilter) => void;
  footer: string;
  countQuery?: string;
  hrefFor: (company: LabCompany) => string;
  actionFor: (company: LabCompany) => string;
  linkAction: (company: LabCompany) => boolean;
  status?: string | null;
  emptyPrompt?: string | null;
  onOpen?: (company: LabCompany) => void;
}) {
  return (
    <LabFrame active="library">
      <div className={styles.page}>
        <section className={styles.intro}>
          <div className={styles.kicker}>Library</div>
          <h1 className={styles.title}>Pick a company to write a memo on.</h1>
          <p className={styles.lede}>{lede}</p>
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
              onChange={(event) => onQuery(event.target.value)}
            />
          </label>
          <div className={styles.filters} role="group" aria-label="Coverage">
            {FILTERS.map((item) => {
              const count = filterLibrary(companies, countQuery, item.id).length;
              const selected = filter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={cn(styles.filter, selected && styles.filterSelected)}
                  aria-pressed={selected}
                  onClick={() => onFilter(item.id)}
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
          {status ? <p className={styles.emptyCopy}>{status}</p> : null}
          {shown.map((company) => {
            const action = actionFor(company);
            const href = hrefFor(company);
            return (
              <div key={company.id} className={styles.row}>
                <span className={styles.ticker}>{company.ticker}</span>
                <span className={styles.name}>{company.name}</span>
                <span className={`${styles.muted} ${styles.hideSmall}`}>{company.sector}</span>
                <span className={`${styles.last} ${styles.hideSmall}`}>{formatLastMemo(company)}</span>
                <span className={styles.status}>
                  {linkAction(company) ? (
                    <Link href={href} className={cn(styles.action, !company.ready && styles.actionSolid)} onClick={() => onOpen?.(company)}>
                      {action}
                    </Link>
                  ) : (
                    <span className={styles.muted}>{action}</span>
                  )}
                </span>
              </div>
            );
          })}
          {shown.length === 0 && trimmed.length > 0 && !status ? (
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
          {shown.length === 0 && emptyPrompt && trimmed.length < 2 ? (
            <div className={styles.empty}>
              <span className={styles.emptyCopy}>{emptyPrompt}</span>
            </div>
          ) : null}
        </section>

        <footer className={styles.footer}>{footer}</footer>
      </div>
    </LabFrame>
  );
}
