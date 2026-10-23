/// <reference types="bun-types" />
import { describe, expect, test } from 'bun:test';

import type { CompanySearchResult } from '../lib/contracts/company';
import { loadHistoryLookups, mapServerHistoryItems, mergeHistoryRuns } from '../lib/lab/history';
import { historyMemoHref, sessionRunToHistoryRun } from '../lib/lab/presentation';
import { scenarioAssumptionDefaults } from '../lib/workbench/scenarioProfiles';

const company = (id: string, name: string): CompanySearchResult => ({
  id,
  symbol: 'MSFT',
  name,
  country: 'US',
  coverageState: 'valuation_ready',
  sourceLinks: [],
});

describe('Lab history helpers', () => {
  test('keeps same-ticker server runs tied to their exact listing when merged and reopened', () => {
    const companies = [
      company('XNAS:MSFT', 'Microsoft Nasdaq'),
      company('BATS:MSFT', 'Microsoft BATS'),
    ];
    const items = [
      {
        id: 'server-xnas', ticker: 'MSFT', timestamp: new Date('2026-10-23T12:00:00.000Z'),
        value: 100, replayAvailable: true, primaryKeyNorm: 'xnas:msft', regionCode: 'US',
      },
      {
        id: 'server-bats', ticker: 'MSFT', timestamp: new Date('2026-10-23T12:00:00.000Z'),
        value: 100, replayAvailable: true, primaryKeyNorm: 'bats:msft', regionCode: 'US',
      },
      {
        id: 'server-bats', ticker: 'MSFT', timestamp: new Date('2026-10-23T12:00:00.000Z'),
        value: 100, replayAvailable: true, primaryKeyNorm: 'bats:msft', regionCode: 'US',
      },
    ];
    const serverRuns = mapServerHistoryItems(items, companies);
    const sessionRun = sessionRunToHistoryRun({
      id: 'session-xnas',
      ticker: 'MSFT',
      name: 'Microsoft Nasdaq',
      listingId: 'XNAS:MSFT',
      value: 100,
      currency: 'USD',
      at: '2026-10-23T12:00:00.000Z',
      scenario: 'base',
      assumptions: {
        bear: scenarioAssumptionDefaults.bear,
        base: scenarioAssumptionDefaults.base,
        bull: scenarioAssumptionDefaults.bull,
      },
      caseQuotes: {},
    });
    const merged = mergeHistoryRuns([sessionRun], serverRuns);

    expect(merged.map((run) => run.id).sort()).toEqual(['server-bats', 'session-xnas']);
    expect(merged.find((run) => run.id === 'server-bats')?.listingId).toBe('BATS:MSFT');
    expect(historyMemoHref({
      id: 'server-bats',
      ticker: 'MSFT',
      listingId: merged.find((run) => run.id === 'server-bats')?.listingId,
    })).toContain('listingId=BATS%3AMSFT');
  });

  test('starts history lookups together and preserves the first ordered error with earlier results', async () => {
    const deferred = <T,>() => {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
      return { promise, resolve };
    };
    const pending = new Map([
      ['MSFT', deferred<{ runs: string[]; authMessage: string | null }>()],
      ['AAPL', deferred<{ runs: string[]; authMessage: string | null }>()],
    ]);
    const started: string[] = [];
    const loading = loadHistoryLookups(['MSFT', 'AAPL'], async (symbol) => {
      started.push(symbol);
      return pending.get(symbol)!.promise;
    });

    expect(started).toEqual(['MSFT', 'AAPL']);
    pending.get('AAPL')!.resolve({ runs: [], authMessage: 'History unavailable.' });
    pending.get('MSFT')!.resolve({ runs: ['msft-run'], authMessage: null });

    await expect(loading).resolves.toEqual({ runs: ['msft-run'], authMessage: 'History unavailable.' });
  });

  test('keeps successful history runs when another symbol lookup rejects', async () => {
    const result = await loadHistoryLookups(['MSFT', 'AAPL'], async (symbol) => {
      if (symbol === 'AAPL') {
        throw new Error('AAPL lookup failed.');
      }
      return { runs: ['msft-run'], authMessage: null };
    });

    expect(result).toEqual({ runs: ['msft-run'], authMessage: 'AAPL lookup failed.' });
  });

  test('keeps abort errors observable to the history loader', async () => {
    const abort = new DOMException('History lookup aborted.', 'AbortError');

    await expect(loadHistoryLookups(['MSFT'], async () => { throw abort; })).rejects.toBe(abort);
  });
});
