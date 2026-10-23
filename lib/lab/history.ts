import type { CompanySearchResult } from '@/lib/contracts/company';
import type { ValuationHistoryItem } from '@/lib/valuationHistory';
import type { LabHistoryRun } from '@/lib/lab/presentation';

export function mapServerHistoryItems(
  items: ValuationHistoryItem[],
  recentCompanies: CompanySearchResult[],
): LabHistoryRun[] {
  const companiesByPrimaryKey = new Map(
    recentCompanies.map((company) => [company.id.trim().toLowerCase(), company]),
  );
  return items.map((item) => {
    const primaryKeyNorm = item.primaryKeyNorm?.trim().toLowerCase() || undefined;
    const company = primaryKeyNorm ? companiesByPrimaryKey.get(primaryKeyNorm) : undefined;
    const name = company?.name ?? item.ticker;
    return {
      id: item.id,
      ticker: item.ticker,
      listingId: company?.id ?? null,
      primaryKeyNorm,
      regionCode: item.regionCode,
      name,
      shortName: name,
      value: item.value,
      at: item.timestamp,
      currency: null,
      scenarioLabel: 'Saved result',
      assumptions: null,
      replayAvailable: item.replayAvailable,
    };
  });
}

function historyRunKey(run: LabHistoryRun): string {
  const identity = run.listingId?.trim().toLowerCase() || run.primaryKeyNorm?.trim().toLowerCase() || '';
  return `${run.ticker.trim().toUpperCase()}:${identity}:${run.value}:${run.at.getTime()}`;
}

export function mergeHistoryRuns(
  sessionRuns: LabHistoryRun[],
  serverRuns: LabHistoryRun[],
): LabHistoryRun[] {
  const seen = new Set(sessionRuns.map(historyRunKey));
  const extra: LabHistoryRun[] = [];
  for (const run of serverRuns) {
    const key = historyRunKey(run);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    extra.push(run);
  }
  return [...sessionRuns, ...extra].sort((left, right) => right.at.getTime() - left.at.getTime());
}

export type HistoryLookupResult<T> = { runs: T[]; authMessage: string | null };

export async function loadHistoryLookups<T>(
  keys: string[],
  lookup: (key: string) => Promise<HistoryLookupResult<T>>,
): Promise<HistoryLookupResult<T>> {
  const results = await Promise.all(keys.map((key) => lookup(key)));
  const runs: T[] = [];
  for (const result of results) {
    if (result.authMessage) {
      return { runs, authMessage: result.authMessage };
    }
    runs.push(...result.runs);
  }
  return { runs, authMessage: null };
}
