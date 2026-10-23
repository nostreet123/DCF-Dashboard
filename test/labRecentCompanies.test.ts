/// <reference types="bun-types" />
import { describe, expect, test } from 'bun:test';

import type { CompanySearchResult } from '../lib/contracts/company';
import { readRecentCompanies, rememberRecentCompany, RECENT_COMPANIES_KEY } from '../lib/lab/recentCompanies';

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
