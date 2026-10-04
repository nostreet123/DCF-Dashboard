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
  formatBillions,
  formatSharePrice,
  formatStartingRevenue,
  buildValueMarks,
  LAB_DISCLAIMER,
  LAB_PATHS,
  isDemoMemoAvailable,
  resolveLabPhase,
} from '../lib/lab/presentation';

describe('lab presentation', () => {
  test('uses one billions scale above and below a million, preserving signs', () => {
    expect(formatBillions(500_000)).toBe('0.0005');
    expect(formatBillions(1_000_000)).toBe('0.001');
    expect(formatBillions(-500_000)).toBe('-0.0005');
    expect(formatBillions(1_000_000_000)).toBe('1.0');
    expect(formatBillions(0)).toBe('0.0');
  });

  test('formats memo values and accessible marks in their result currency', () => {
    expect(formatSharePrice(100, 2, 'EUR')).toBe('€100.00');
    expect(formatStartingRevenue(500_000, 'EUR')).toBe('€500,000.0');
    expect(formatStartingRevenue(1_000_000, 'EUR')).toBe('€0.001B');
    expect(buildValueMarks({ bear: 80, bull: 120, memo: 100, price: null, currency: 'EUR' }).alt).toContain('€100.00');
    expect(buildSensitivityGrid({ matrix: [[100]], growthOffsets: [0], waccOffsets: [0], baseGrowth: 12, baseDiscount: 9, price: null, compact: false, currency: 'EUR' }).cells.at(-1)?.text).toBe('€100');
  });

  test('labels the bridge with the actual forecast horizon', () => {
    const bridge = { pvExplicit: 1e9, pvTerminal: 2e9, cash: 0, debt: 0, equity: 3e9, sharesOutstanding: 1e8 };
    expect(buildBridgeRows(bridge, 10)[0]?.label).toBe('PV of 10-year cash flow');
    expect(buildBridgeRows(bridge, 5)[0]?.label).toBe('PV of 5-year cash flow');
    expect(buildBridgeRows(bridge)[0]?.label).toBe('PV of explicit cash flow');
  });

  test('puts the memo, library, and history on the front door', () => {
    expect(LAB_PATHS.memo).toBe('/');
    expect(LAB_PATHS.library).toBe('/library');
    expect(LAB_PATHS.history).toBe('/history');
    expect(LAB_PATHS.workbench).toBe('/workbench');
  });

  test('shows initial loading and errors without masking them with an old result', () => {
    expect(resolveLabPhase({
      queryStatus: 'memo',
      workspaceMode: 'valuation',
      hasError: false,
      hasValue: false,
    })).toBe('computing');
    expect(resolveLabPhase({
      queryStatus: 'computing',
      workspaceMode: 'valuation',
      hasError: false,
      hasValue: true,
    })).toBe('computing');
    expect(resolveLabPhase({
      queryStatus: 'import',
      workspaceMode: 'valuation',
      hasError: false,
      hasValue: false,
    })).toBe('import');
    expect(resolveLabPhase({
      queryStatus: 'memo',
      workspaceMode: 'valuation',
      hasError: true,
      hasValue: false,
    })).toBe('unavailable');
    expect(resolveLabPhase({
      queryStatus: 'memo',
      workspaceMode: 'valuation',
      hasError: true,
      hasValue: true,
    })).toBe('unavailable');
    expect(resolveLabPhase({
      queryStatus: 'import', workspaceMode: 'valuation', hasError: false,
      hasValue: true, importApproved: true,
    })).toBe('memo');
  });

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
    expect(filterLibrary(catalog, '', 'ready').map((company) => company.ticker)).toEqual(['AAPL']);
  });

  test('never opens an unsupported demo ticker or result-only run as an Apple memo', () => {
    expect(isDemoMemoAvailable(null, null)).toBe(true);
    expect(isDemoMemoAvailable('aapl', 'r1')).toBe(true);
    expect(isDemoMemoAvailable('MSFT', null)).toBe(false);
    expect(isDemoMemoAvailable(null, 'r2')).toBe(false);
    expect(isDemoMemoAvailable('AAPL', 'unknown')).toBe(false);
  });

  test('preserves signed bridge amounts and bounded waterfall positions', () => {
    const rows = buildBridgeRows({
      pvExplicit: -63.6, pvTerminal: 413, cash: 10, debt: 50,
      equity: 309.4, sharesOutstanding: 10,
    });
    expect(rows[0]?.amount).toBe(-63.6);
    expect(rows[0]?.valueLabel).toBe('−0.000000064');
    expect(rows.filter((row) => !row.emphasis).reduce((sum, row) => sum + row.amount, 0)).toBeCloseTo(309.4);
    for (const row of rows) {
      expect(row.left).toBeGreaterThanOrEqual(0);
      expect(row.width).toBeGreaterThanOrEqual(0);
      expect(row.left + row.width).toBeLessThanOrEqual(100.000001);
    }
    const zero = buildBridgeRows({ pvExplicit: 0, pvTerminal: -10, cash: 0, debt: 20, equity: -30, sharesOutstanding: 1 });
    expect(zero).toHaveLength(5);
    expect(zero.find((row) => row.tone === 'equity')?.amount).toBe(-30);
  });

  test('does not invent a present-value split when forecast data is missing', () => {
    const bridge = bridgeFromStatements(100, { cash: 10, debt: 50, sharesOutstanding: 10 });
    expect(bridge.pvExplicit).toBeNull();
    expect(bridge.pvTerminal).toBeNull();
    const signed = bridgeFromStatements(-3, null, { pvExplicit: -10, pvTerminal: null, cash: 0, debt: 20, equity: -30, sharesOutstanding: 1 });
    expect(signed.pvTerminal).toBe(0);
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
      'PV of explicit cash flow',
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
