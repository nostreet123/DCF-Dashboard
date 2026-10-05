/// <reference types="bun-types" />
import { describe, expect, test } from 'bun:test';

import { rememberSessionRun, readSessionRuns } from '../lib/lab/sessionRuns';
import { scenarioAssumptionDefaults } from '../lib/workbench/scenarioProfiles';

describe('session memo runs', () => {
  test('remembers a calculated case and replaces the same assumptions', () => {
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
      const first = rememberSessionRun({
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
      const second = rememberSessionRun({
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

      expect(readSessionRuns()).toHaveLength(1);
      expect(readSessionRuns()[0]?.value).toBe(110);
      expect(readSessionRuns()[0]?.id).toBe(second.id);
      expect(first.assumptions.base.revenueGrowth).toBe(12.5);
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
});