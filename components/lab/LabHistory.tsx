'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';

import { LabFrame } from '@/components/lab/LabFrame';
import { areBrowserHistoryReadsEnabled, getDashboardDataMode } from '@/lib/dashboardDataMode';
import {
  buildDemoHistory,
  demoDisclaimer,
  formatAssumptionPercent,
  formatLabDate,
  formatLabDay,
  formatLabTime,
  formatSharePriceWhenCurrencyKnown,
  historyMemoHref,
  LAB_PATHS,
  sessionRunToHistoryRun,
  type LabHistoryRun,
} from '@/lib/lab/presentation';
import { readRecentCompanies } from '@/lib/lab/recentCompanies';
import { getServerSessionRuns, readSessionRuns, subscribeSessionRuns } from '@/lib/lab/sessionRuns';
import { toUserFacingValuationHistoryError } from '@/lib/hooks/useValuationHistory';
import {
  buildValuationHistoryPath,
  mapValuationRunsToHistoryItems,
  type ValuationRun,
} from '@/lib/valuationHistory';
import { cn } from '@/lib/utils/cn';
import styles from './history.module.css';

export function LabHistory() {
  const isDemo = getDashboardDataMode() === 'demo';
  if (isDemo) {
    return <DemoHistory />;
  }
  return <LiveHistory />;
}

function DemoHistory() {
  const runs = buildDemoHistory();
  const [selectedId, setSelectedId] = useState(runs[0]?.id ?? '');
  const selected = runs.find((run) => run.id === selectedId) ?? runs[0];
  return (
    <HistoryPage
      title="Illustrative demo runs."
      lede="Apple includes a complete demo snapshot. The Microsoft and Alphabet entries are example results only; their original assumptions and details are unavailable."
      runs={runs}
      selected={selected}
      onSelect={setSelectedId}
      footer={demoDisclaimer('Demo runs.')}
      unavailableCopy="Result-only demo. No assumptions or full memo were saved for this example."
      canOpen={(run) => Boolean(run.assumptions)}
      openHref={(run) => `${LAB_PATHS.memo}?run=${encodeURIComponent(run.id)}`}
    />
  );
}

function LiveHistory() {
  const sessionRuns = useSyncExternalStore(subscribeSessionRuns, readSessionRuns, getServerSessionRuns);
  const [recentSymbols, setRecentSymbols] = useState<string[]>([]);
  const [serverRuns, setServerRuns] = useState<LabHistoryRun[]>([]);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const mappedSession = sessionRuns.map(sessionRunToHistoryRun);
  const symbols = uniqueSymbols(sessionRuns.map((run) => run.ticker).concat(recentSymbols));
  const symbolKey = symbols.join('|');

  useEffect(() => {
    setRecentSymbols(readRecentSymbols());
  }, []);

  useEffect(() => {
    if (symbols.length === 0) {
      setServerRuns([]);
      setAuthMessage(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    void loadServerRuns(symbols, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }
        setServerRuns(result.runs);
        setAuthMessage(result.authMessage);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setServerRuns([]);
        setAuthMessage(error instanceof Error ? error.message : 'Unable to load recent runs.');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => controller.abort();
    // symbolKey is the stable identity for the ticker list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolKey]);

  const runs = mergeRuns(mappedSession, serverRuns);
  const [selectedId, setSelectedId] = useState('');
  const selected = runs.find((run) => run.id === selectedId) ?? runs[0];
  const sessionById = new Map(sessionRuns.map((run) => [run.id, run]));

  return (
    <HistoryPage
      title="Saved memos."
      lede="Browser-only memos are temporary: they stay in this tab’s session and are not saved to your account. Server runs appear when this session is allowed to read them."
      runs={runs}
      selected={selected}
      onSelect={setSelectedId}
      footer="For financial modeling and education only; not investment advice."
      note={loading ? 'Checking saved runs…' : authMessage}
      canOpen={() => true}
      openHref={(run) => {
        const session = sessionById.get(run.id);
        return historyMemoHref({
          id: run.id,
          ticker: run.ticker,
          listingId: session?.listingId,
        });
      }}
      rerunHref={(run) => {
        const session = sessionById.get(run.id);
        if (!session) {
          return null;
        }
        return historyMemoHref({
          id: run.id,
          ticker: run.ticker,
          listingId: session.listingId,
          rerun: true,
        });
      }}
    />
  );
}

function HistoryPage({
  title,
  lede,
  runs,
  selected,
  onSelect,
  footer,
  note,
  unavailableCopy = 'This saved result does not include assumptions for this session, so it cannot be rerun from here.',
  canOpen,
  openHref,
  rerunHref,
}: {
  title: string;
  lede: string;
  runs: LabHistoryRun[];
  selected: LabHistoryRun | undefined;
  onSelect: (id: string) => void;
  footer: string;
  note?: string | null;
  unavailableCopy?: string;
  canOpen: (run: LabHistoryRun) => boolean;
  openHref: (run: LabHistoryRun) => string;
  rerunHref?: (run: LabHistoryRun) => string | null;
}) {
  return (
    <LabFrame active="history">
      <div className={styles.page}>
        <section className={styles.intro}>
          <div className={styles.kicker}>Run history</div>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.lede}>{lede}</p>
        </section>

        <div className={styles.columns}>
          <section className={styles.runs} aria-label="Saved runs">
            {runs.length === 0 ? <p className={styles.empty}>No saved runs yet. Search the library and write a memo.</p> : null}
            {runs.map((run) => {
              const selectedRun = run.id === selected?.id;
              return (
                <button
                  key={run.id}
                  type="button"
                  className={cn(styles.run, selectedRun && styles.runSelected)}
                  aria-pressed={selectedRun}
                  onClick={() => onSelect(run.id)}
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
                  <span className={styles.runValue}>{formatSharePriceWhenCurrencyKnown(run.value, run.currency)}</span>
                </button>
              );
            })}
            {note ? <p className={styles.note}>{note}</p> : null}
            {runs.length > 0 ? <p className={styles.note}>Showing {runs.length} saved {runs.length === 1 ? 'run' : 'runs'}.</p> : null}
          </section>

          {selected ? (
            <article className={styles.preview} aria-label="Run preview">
              <div className={styles.previewKicker}>
                Saved {formatLabDate(selected.at)} · {selected.ticker} · {selected.scenarioLabel}
              </div>
              <h2 className={styles.previewTitle}>
                {selected.shortName} looked worth <span className={styles.accent}>{formatSharePriceWhenCurrencyKnown(selected.value, selected.currency)}</span> a share.
              </h2>
              {selected.assumptions ? (
                <p className={styles.previewCopy}>
                  That memo assumed revenue growth of <span className={styles.accent}>{formatAssumptionPercent(selected.assumptions.revenueGrowth, 'growth')}</span> a year at a <span className={styles.accent}>{formatAssumptionPercent(selected.assumptions.operatingMargin, 'margin')}</span> operating margin, discounted at <span className={styles.accent}>{formatAssumptionPercent(selected.assumptions.discountRate, 'discount')}</span>, with <span className={styles.accent}>{formatAssumptionPercent(selected.assumptions.terminalGrowth, 'terminal')}</span> terminal growth.
                </p>
              ) : (
                <p className={styles.previewCopy}>{unavailableCopy}</p>
              )}
              {canOpen(selected) ? (
                <div className={styles.actions}>
                  <Link href={openHref(selected)} className={styles.primary}>
                    Open this memo
                  </Link>
                  {selected.assumptions && rerunHref?.(selected) ? (
                    <Link href={rerunHref(selected) ?? LAB_PATHS.memo} className={styles.secondary}>
                      Rerun this memo
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </article>
          ) : null}
        </div>

        <footer className={styles.footer}>{footer}</footer>
      </div>
    </LabFrame>
  );
}

function readRecentSymbols(): string[] {
  return readRecentCompanies()
    .map((company) => company.symbol.trim().toUpperCase())
    .filter((symbol) => symbol.length > 0);
}

function uniqueSymbols(symbols: string[]): string[] {
  return [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))].slice(0, 8);
}

function mergeRuns(sessionRuns: LabHistoryRun[], serverRuns: LabHistoryRun[]): LabHistoryRun[] {
  const seen = new Set(sessionRuns.map((run) => `${run.ticker}:${run.value}:${run.at.getTime()}`));
  const extra = serverRuns.filter((run) => !seen.has(`${run.ticker}:${run.value}:${run.at.getTime()}`));
  return [...sessionRuns, ...extra].sort((left, right) => right.at.getTime() - left.at.getTime());
}

async function loadServerRuns(
  symbols: string[],
  signal: AbortSignal,
): Promise<{ runs: LabHistoryRun[]; authMessage: string | null }> {
  const browserReads = areBrowserHistoryReadsEnabled();
  const runs: LabHistoryRun[] = [];
  for (const symbol of symbols) {
    const path = buildValuationHistoryPath({ symbol, limit: 10 }, { browserReads });
    if (!path) {
      continue;
    }
    const response = await fetch(path, { method: 'GET', signal });
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
      runs?: ValuationRun[];
    };
    if (!response.ok) {
      return {
        runs,
        authMessage: toUserFacingValuationHistoryError({
          status: response.status,
          message: payload.message,
        }).message,
      };
    }
    for (const item of mapValuationRunsToHistoryItems(payload.runs ?? [])) {
      runs.push({
        id: item.id,
        ticker: item.ticker,
        name: item.ticker,
        shortName: item.ticker,
        value: item.value,
        at: item.timestamp,
        currency: null,
        scenarioLabel: 'Saved result',
        assumptions: null,
      });
    }
  }
  return { runs, authMessage: null };
}
