/// <reference types="bun-types" />
import { describe, expect, test } from 'bun:test';

import { findSessionRunForCompany, rememberSessionRun, readSessionRuns } from '../lib/lab/sessionRuns';
import { scenarioAssumptionDefaults } from '../lib/workbench/scenarioProfiles';

function sampleRun(listingId: string | null, id = 'session:MSFT:1'): Omit<import('../lib/lab/sessionRuns').SessionMemoRun, 'id' | 'at'> & { id?: string; at?: string } {
  return {
    id,
    ticker: 'MSFT',
    name: 'Microsoft Corporation',
    listingId,
    value: -12,
    currency: 'USD',
    scenario: 'base',
    assumptions: {
      bear: scenarioAssumptionDefaults.bear,
      base: scenarioAssumptionDefaults.base,
      bull: scenarioAssumptionDefaults.bull,
    },
    caseQuotes: {},
  };
}

describe('session memo runs', () => {
  test('retains distinct listings for one ticker and replaces true duplicates', () => {
    const previousWindow = (globalThis as { window?: unknown }).window;
    const store = new Map<string, string>();
    const events: string[] = [];
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        sessionStorage: {
          getItem: (key: string) => store.get(key) ?? null,
          setItem: (key: string, value: string) => {
            store.set(key, value);
          },
        },
        dispatchEvent: (event: Event) => {
          events.push(event.type);
          return true;
        },
      },
    });

    try {
      rememberSessionRun({
        id: 'session:MSFT:company-msft:1',
        ticker: 'MSFT',
        name: 'Microsoft Corporation',
        listingId: 'company-msft',
        value: 100,
        currency: 'USD',
        scenario: 'base',
        assumptions: {
          bear: scenarioAssumptionDefaults.bear,
          base: { ...scenarioAssumptionDefaults.base, revenueGrowth: 12.5 },
          bull: scenarioAssumptionDefaults.bull,
        },
        caseQuotes: { base: 98.3 },
      });
      const otherListing = rememberSessionRun({
        id: 'session:MSFT:exchange-msft:1',
        ticker: 'MSFT',
        name: 'Microsoft Corporation, alternate listing',
        listingId: 'exchange:msft',
        value: 120,
        currency: 'USD',
        scenario: 'base',
        assumptions: {
          bear: scenarioAssumptionDefaults.bear,
          base: { ...scenarioAssumptionDefaults.base, revenueGrowth: 12.5 },
          bull: scenarioAssumptionDefaults.bull,
        },
        caseQuotes: { base: 98.3 },
      });

      expect(readSessionRuns()).toHaveLength(2);
      expect(readSessionRuns().map((run) => run.listingId).sort()).toEqual(['company-msft', 'exchange:msft']);

      const replacement = rememberSessionRun({
        id: 'session:MSFT:company-msft:2',
        ticker: 'MSFT',
        name: 'Microsoft Corporation',
        listingId: 'company-msft',
        value: 110,
        currency: 'USD',
        scenario: 'base',
        assumptions: {
          bear: scenarioAssumptionDefaults.bear,
          base: { ...scenarioAssumptionDefaults.base, revenueGrowth: 12.5 },
          bull: scenarioAssumptionDefaults.bull,
        },
        caseQuotes: { base: 98.3 },
      });

      expect(readSessionRuns()).toHaveLength(2);
      expect(readSessionRuns()[0]?.value).toBe(110);
      expect(readSessionRuns()[0]?.id).toBe(replacement.id);
      expect(readSessionRuns()[1]?.id).toBe(otherListing.id);
      expect(readSessionRuns().find((run) => run.id === replacement.id)?.assumptions.base.revenueGrowth).toBe(12.5);
      expect(events).toContain('dcf-lab:session-runs-change');
    } finally {
      if (previousWindow === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        Object.defineProperty(globalThis, 'window', {
          configurable: true,
          value: previousWindow,
        });
      }
    }
  });

  test('matches a listing-specific memo before an unscoped ticker memo', () => {
    const exact = { ...sampleRun('exchange:msft'), id: 'exact', at: '2026-10-23T12:00:00.000Z' };
    const other = { ...sampleRun('company:msft'), id: 'other', at: '2026-10-23T12:00:00.000Z' };
    const unscoped = { ...sampleRun(null), id: 'unscoped', at: '2026-10-23T12:00:00.000Z' };
    expect(findSessionRunForCompany([other, unscoped, exact], 'exchange:msft', 'MSFT')?.id).toBe('exact');
    expect(findSessionRunForCompany([other, unscoped], 'exchange:msft', 'MSFT')?.id).toBe('unscoped');
    expect(findSessionRunForCompany([other], 'exchange:msft', 'MSFT')).toBeNull();
  });

  test('discards malformed persisted values and tolerates denied session storage', () => {
    const previousWindow = (globalThis as { window?: unknown }).window;
    const invalidRuns = [
      { ...sampleRun('company:msft'), id: 'bad-date', at: 'not-a-date' },
      { ...sampleRun('company:msft'), id: 'bad-currency', at: '2026-10-23T12:00:00.000Z', currency: 'US' },
      { ...sampleRun('company:msft'), id: 'infinite', at: '2026-10-23T12:00:00.000Z', value: 1e400 },
    ];
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { sessionStorage: { getItem: () => JSON.stringify(invalidRuns), setItem: () => undefined } },
    });
    try {
      expect(readSessionRuns()).toEqual([]);
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: Object.defineProperty({}, 'sessionStorage', { get() { throw new Error('denied'); } }),
      });
      expect(readSessionRuns()).toEqual([]);
      expect(() => rememberSessionRun(sampleRun(null))).not.toThrow();
    } finally {
      if (previousWindow === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
      }
    }
  });
});
