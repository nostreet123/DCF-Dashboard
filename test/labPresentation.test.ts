/// <reference types="bun-types" />
import { describe, expect, test } from 'bun:test';

import { mockDemoReplaySnapshot, mockProjectionRows, mockSensitivityMatrix, mockStatementHistory } from '../lib/workbench/mockData';
import {
  bridgeFromStatements,
  buildBridgeRows,
  buildDemoHistory,
  buildLibraryCatalog,
  buildSensitivityGrid,
  caseLabel,
  demoDisclaimer,
  demoSensitivityOffsets,
  filterLibrary,
  formatAssumptionPercent,
  gapPhrase,
  LAB_DISCLAIMER,
} from '../lib/lab/presentation';

describe('lab presentation', () => {
  test('describes the demo price gap and keeps the education disclaimer', () => {
    expect(gapPhrase(145.2, 152.35)).toBe('4.7% below');
    expect(demoDisclaimer('Illustrative demo data.')).toContain(LAB_DISCLAIMER);
    expect(LAB_DISCLAIMER).toContain('not investment advice');
  });

  test('formats the saved Apple assumptions the way the memo reads them', () => {
    const saved = mockDemoReplaySnapshot.assumptions.base;
    expect(formatAssumptionPercent(saved.revenueGrowth, 'growth')).toBe('8%');
    expect(formatAssumptionPercent(saved.operatingMargin, 'margin')).toBe('20%');
    expect(formatAssumptionPercent(saved.discountRate, 'discount')).toBe('9.0%');
    expect(formatAssumptionPercent(saved.terminalGrowth, 'terminal')).toBe('2.0%');
    expect(caseLabel('base', saved, { base: saved })).toBe('Base case');
    expect(caseLabel('base', { ...saved, revenueGrowth: 9 }, { base: saved })).toBe('Your case');
  });

  test('filters the library and keeps NVIDIA as an import candidate', () => {
    const catalog = buildLibraryCatalog();
    expect(catalog.some((company) => company.ticker === 'NVDA' && !company.ready)).toBe(true);
    expect(filterLibrary(catalog, 'zz', 'all')).toEqual([]);
    expect(filterLibrary(catalog, 'nvda', 'import').map((company) => company.ticker)).toEqual(['NVDA']);
  });

  test('slices the demo sensitivity matrix to the five-by-five window', () => {
    const offsets = demoSensitivityOffsets();
    const grid = buildSensitivityGrid({
      matrix: mockSensitivityMatrix,
      growthOffsets: offsets.growth,
      waccOffsets: offsets.wacc,
      baseGrowth: 8,
      baseDiscount: 9,
      price: 152.35,
      compact: false,
    });
    expect(grid.columns).toBe(6);
    expect(grid.cells.filter((cell) => cell.role === 'value')).toHaveLength(25);
    expect(grid.cells.some((cell) => cell.isBase && cell.text === '$130')).toBe(true);
    expect(grid.cells.filter((cell) => cell.abovePrice)).toHaveLength(3);
  });

  test('builds present-value rows that tie cash and debt back to equity', () => {
    const statement = mockStatementHistory[0];
    if (!statement) {
      throw new Error('missing statement');
    }
    const bridge = bridgeFromStatements(145.2, statement, undefined, {
      cashFlows: mockProjectionRows.map((row) => row.freeCashFlow),
      discountRate: 9,
      terminalGrowth: 2,
    });
    const rows = buildBridgeRows(bridge);
    expect(rows.map((row) => row.label)).toEqual([
      'PV of 5-year cash flow',
      'PV of terminal value',
      'Plus cash',
      'Less debt',
      'Equity value',
    ]);
    expect(rows.find((row) => row.label === 'Equity value')?.valueLabel).toBe('2,192.5');
    const tied =
      (bridge.pvExplicit ?? 0) + (bridge.pvTerminal ?? 0) + (bridge.cash ?? 0) - (bridge.debt ?? 0);
    expect(Math.abs(tied - (bridge.equity ?? 0))).toBeLessThan(1);
    expect(bridge.pvExplicit ?? 0).toBeGreaterThan(0);
    expect(bridge.pvTerminal ?? 0).toBeGreaterThan(0);
  });

  test('keeps assumptions only on the saved Apple run', () => {
    const runs = buildDemoHistory();
    expect(runs[0]?.assumptions?.revenueGrowth).toBe(8);
    expect(runs.slice(1).every((run) => run.assumptions === null)).toBe(true);
  });
});
