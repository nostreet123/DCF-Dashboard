/// <reference types="bun-types" />
import { describe, expect, test } from 'bun:test';

import type { CompanySearchResult } from '../lib/contracts/company';
import { markRecentCompanyReady, readRecentCompanies, rememberRecentCompany, RECENT_COMPANIES_KEY } from '../lib/lab/recentCompanies';
import { companyFromSearch, libraryAction, withLatestMemo } from '../lib/lab/presentation';

const company: CompanySearchResult = {
  id: 'company-msft',
  symbol: 'MSFT',
  name: 'Microsoft Corporation',
  coverageState: 'valuation_ready',
  sourceLinks: [{ title: 'Filing', url: 'https://example.test/filing' }],
};

const olderCompany: CompanySearchResult = {
  ...company,
  id: 'company-aapl',
  symbol: 'AAPL',
  name: 'Apple Inc.',
};

describe('recent companies', () => {
  test('promotes an approved import so a recent valuation opens as a memo', () => {
    const previousWindow = (globalThis as { window?: unknown }).window;
    const store = new Map<string, string>();
    const pendingCompany: CompanySearchResult = {
      ...company,
      id: 'XNAS:MSFT',
      coverageState: 'import_required',
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => store.get(key) ?? null,
          setItem: (key: string, value: string) => { store.set(key, value); },
        },
      },
    });
    try {
      rememberRecentCompany(pendingCompany);
      const promoted = markRecentCompanyReady(pendingCompany);
      const recent = promoted.find((item) => item.id === pendingCompany.id);
      expect(recent?.coverageState).toBe('valuation_ready');
      expect(readRecentCompanies().find((item) => item.id === pendingCompany.id)?.coverageState)
        .toBe('valuation_ready');

      const libraryEntry = withLatestMemo(companyFromSearch(recent!), {
        value: 100,
        at: '2026-10-23T12:00:00.000Z',
        currency: 'USD',
      });
      expect(libraryAction(libraryEntry)).toBe('Open memo');
    } finally {
      if (previousWindow === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
      }
    }
  });

  test('discards malformed records and tolerates local storage failures', () => {
    const previousWindow = (globalThis as { window?: unknown }).window;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => key === RECENT_COMPANIES_KEY
            ? JSON.stringify([{ id: 'bad', symbol: 'BAD', name: 'Broken' }, company])
            : null,
          setItem: () => { throw new Error('denied'); },
        },
      },
    });
    try {
      expect(readRecentCompanies()).toEqual([company]);
      expect(() => rememberRecentCompany(company)).not.toThrow();
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: Object.defineProperty({}, 'localStorage', { get() { throw new Error('denied'); } }),
      });
      expect(readRecentCompanies()).toEqual([]);
      expect(() => rememberRecentCompany(company)).not.toThrow();
      expect(rememberRecentCompany(company, [olderCompany])).toEqual([company, olderCompany]);
      expect(rememberRecentCompany(company, [company, olderCompany])).toEqual([company, olderCompany]);
    } finally {
      if (previousWindow === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
      }
    }
  });
});
