import type { Assumptions, Scenario } from '@/lib/workbench/scenarioProfiles';

export interface SessionMemoRun {
  id: string;
  ticker: string;
  name: string;
  listingId: string | null;
  value: number;
  currency: string;
  at: string;
  scenario: Scenario;
  assumptions: Record<Scenario, Assumptions>;
  caseQuotes: Partial<Record<Scenario, number>>;
}

const STORAGE_KEY = 'dcf-lab:session-runs';
const CHANGE_EVENT = 'dcf-lab:session-runs-change';
const MAX_RUNS = 20;
const EMPTY_SESSION_RUNS: SessionMemoRun[] = [];
let cachedRaw: string | null = null;
let cachedRuns: SessionMemoRun[] = EMPTY_SESSION_RUNS;

function canUseStorage(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return typeof window.sessionStorage !== 'undefined';
  } catch {
    return false;
  }
}

function isAssumptions(value: unknown): value is Assumptions {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.revenueGrowth === 'number' &&
    Number.isFinite(record.revenueGrowth) &&
    typeof record.operatingMargin === 'number' &&
    Number.isFinite(record.operatingMargin) &&
    typeof record.discountRate === 'number' &&
    Number.isFinite(record.discountRate) &&
    typeof record.terminalGrowth === 'number'
    && Number.isFinite(record.terminalGrowth)
  );
}

function isSessionRun(value: unknown): value is SessionMemoRun {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  const assumptions = record.assumptions as Record<string, unknown> | undefined;
  return (
    typeof record.id === 'string' &&
    typeof record.ticker === 'string' &&
    typeof record.name === 'string' &&
    (record.listingId === null || typeof record.listingId === 'string') &&
    typeof record.value === 'number' &&
    Number.isFinite(record.value) &&
    typeof record.currency === 'string' &&
    /^[A-Za-z]{3}$/.test(record.currency) &&
    typeof record.at === 'string' &&
    Number.isFinite(Date.parse(record.at)) &&
    (record.scenario === 'bear' || record.scenario === 'base' || record.scenario === 'bull') &&
    Boolean(assumptions) &&
    isAssumptions(assumptions?.bear) &&
    isAssumptions(assumptions?.base) &&
    isAssumptions(assumptions?.bull)
  );
}

export function readSessionRuns(): SessionMemoRun[] {
  if (!canUseStorage()) {
    return EMPTY_SESSION_RUNS;
  }
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return EMPTY_SESSION_RUNS;
  }
  if (raw === cachedRaw) {
    return cachedRuns;
  }
  cachedRaw = raw;
  if (!raw) {
    cachedRuns = EMPTY_SESSION_RUNS;
    return cachedRuns;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    cachedRuns = Array.isArray(parsed) ? parsed.filter(isSessionRun) : EMPTY_SESSION_RUNS;
  } catch {
    cachedRuns = EMPTY_SESSION_RUNS;
  }
  return cachedRuns;
}

export function getServerSessionRuns(): SessionMemoRun[] {
  return EMPTY_SESSION_RUNS;
}

export function findSessionRun(id: string | null | undefined): SessionMemoRun | null {
  if (!id) {
    return null;
  }
  return readSessionRuns().find((run) => run.id === id) ?? null;
}

export function findSessionRunForCompany(
  runs: SessionMemoRun[],
  listingId: string | null,
  ticker: string,
): SessionMemoRun | null {
  if (listingId) {
    return runs.find((run) => run.listingId === listingId) ??
      runs.find((run) => run.ticker === ticker && run.listingId === null) ??
      null;
  }
  return runs.find((run) => run.ticker === ticker && run.listingId === null) ?? null;
}

function sameCase(left: SessionMemoRun, right: SessionMemoRun): boolean {
  return (
    left.ticker === right.ticker &&
    left.listingId === right.listingId &&
    left.scenario === right.scenario &&
    JSON.stringify(left.assumptions) === JSON.stringify(right.assumptions)
  );
}

export function rememberSessionRun(run: Omit<SessionMemoRun, 'id' | 'at'> & { id?: string; at?: string }): SessionMemoRun {
  const stored = readSessionRuns();
  const nextRun: SessionMemoRun = {
    ...run,
    id: run.id ?? `session:${run.ticker}:${Date.now()}`,
    at: run.at ?? new Date().toISOString(),
    caseQuotes: run.caseQuotes ?? {},
  };
  const withoutMatch = stored.filter((item) => item.id !== nextRun.id && !sameCase(item, nextRun));
  const next = [nextRun, ...withoutMatch].slice(0, MAX_RUNS);
  if (canUseStorage()) {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
      // Keep the computed result usable when session storage is unavailable.
    }
  }
  return nextRun;
}

export function subscribeSessionRuns(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  const notify = () => onStoreChange();
  window.addEventListener(CHANGE_EVENT, notify);
  window.addEventListener('storage', notify);
  return () => {
    window.removeEventListener(CHANGE_EVENT, notify);
    window.removeEventListener('storage', notify);
  };
}
