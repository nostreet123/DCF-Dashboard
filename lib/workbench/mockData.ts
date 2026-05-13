export interface MockDatasetItem {
  id: string;
  name: string;
  ticker: string;
}

export type MockDatasetGroups = Record<string, MockDatasetItem[]>;

export const mockDatasets: MockDatasetGroups = {
  Technology: [
    { id: '1', name: 'Apple Inc.', ticker: 'AAPL' },
    { id: '2', name: 'Microsoft Corp.', ticker: 'MSFT' },
    { id: '3', name: 'Alphabet Inc.', ticker: 'GOOGL' },
    { id: '4', name: 'Amazon.com Inc.', ticker: 'AMZN' },
  ],
  Finance: [
    { id: '5', name: 'JPMorgan Chase', ticker: 'JPM' },
    { id: '6', name: 'Goldman Sachs', ticker: 'GS' },
  ],
  Healthcare: [
    { id: '7', name: 'Johnson & Johnson', ticker: 'JNJ' },
    { id: '8', name: 'Pfizer Inc.', ticker: 'PFE' },
  ],
};

export const mockRunHistory = [
  { id: 'r1', timestamp: new Date('2026-05-02T10:00:00.000Z'), ticker: 'AAPL', value: 145.2 },
  { id: 'r2', timestamp: new Date('2026-05-02T09:00:00.000Z'), ticker: 'MSFT', value: 378.5 },
  { id: 'r3', timestamp: new Date('2026-05-01T10:00:00.000Z'), ticker: 'GOOGL', value: 142.8 },
];

export const mockPriceHistory = [140, 142, 138, 145, 143, 148, 146, 150, 152];

export const mockHistogram = {
  binCenters: [100, 110, 120, 130, 140, 150, 160, 170, 180, 190],
  density: [0.02, 0.05, 0.12, 0.22, 0.28, 0.18, 0.08, 0.03, 0.015, 0.005],
};

export const scenarioValues = {
  base: 145.2,
  bull: 185.5,
  bear: 112.3,
};

export const fallbackRange: [number, number] = [112.3, 185.5];

export const mockSensitivityMatrix = [
  [130, 140, 151, 163, 176, 190, 205, 221, 238],
  [121, 130, 140, 151, 163, 176, 190, 205, 221],
  [112, 121, 130, 140, 151, 163, 176, 190, 205],
  [104, 112, 121, 130, 140, 151, 163, 176, 190],
  [97, 104, 112, 121, 130, 140, 151, 163, 176],
  [90, 97, 104, 112, 121, 130, 140, 151, 163],
  [84, 90, 97, 104, 112, 121, 130, 140, 151],
  [78, 84, 90, 97, 104, 112, 121, 130, 140],
  [72, 78, 84, 90, 97, 104, 112, 121, 130],
];

export const mockProjectionRows = [
  { year: 2027, revenue: 425000000000, ebit: 132000000000, nopat: 99000000000, freeCashFlow: 110000000000 },
  { year: 2028, revenue: 460000000000, ebit: 147000000000, nopat: 110250000000, freeCashFlow: 122000000000 },
  { year: 2029, revenue: 498000000000, ebit: 162000000000, nopat: 121500000000, freeCashFlow: 135000000000 },
  { year: 2030, revenue: 540000000000, ebit: 178000000000, nopat: 133500000000, freeCashFlow: 148000000000 },
  { year: 2031, revenue: 575000000000, ebit: 190000000000, nopat: 142500000000, freeCashFlow: 158000000000 },
];

export const mockKpis = [
  { key: 'reinvestment', label: 'Reinvestment', value: 0.18, score: 74, direction: 'lower' as const, unit: 'x' },
  { key: 'margin', label: 'EBIT Margin', value: 31.2, score: 82, direction: 'higher' as const, unit: '%' },
  { key: 'growth', label: 'Revenue Growth', value: 7.8, score: 69, direction: 'higher' as const, unit: '%' },
  { key: 'spread', label: 'ROIC Spread', value: 5.1, score: 77, direction: 'higher' as const, unit: '%' },
];

export const mockStatementHistory = [
  { periodEnd: '2026-09-30', revenue: 394000000000, cash: 64000000000, debt: 109000000000, sharesOutstanding: 15100000000 },
  { periodEnd: '2025-09-30', revenue: 383000000000, cash: 62000000000, debt: 108000000000, sharesOutstanding: 15400000000 },
  { periodEnd: '2024-09-30', revenue: 391000000000, cash: 61000000000, debt: 111000000000, sharesOutstanding: 15800000000 },
];

export const mockMonteCarloSummary = {
  runs: 25000,
  min: 89.4,
  max: 231.8,
  mean: 149.6,
  median: 146.7,
  p10: 112.3,
  p25: 130.4,
  p75: 169.1,
  p90: 185.5,
};

export const mockProvenance = {
  symbol: 'AAPL',
  name: 'Apple Inc.',
  cik: '0000320193',
  currency: 'USD',
  source: 'edgar',
  latestPeriodEnd: '2026-09-30',
  latestFilingDate: '2026-10-31',
  latestStatementSource: 'SEC companyfacts',
};

export const mockDemoReplaySnapshot = {
  runId: 'demo-replay-r1',
  ticker: 'AAPL',
  createdAt: new Date('2026-05-02T10:00:00.000Z').getTime(),
  scenario: 'base' as const,
  assumptions: {
    base: { revenueGrowth: 8, operatingMargin: 20, discountRate: 9, terminalGrowth: 2 },
    bull: { revenueGrowth: 10, operatingMargin: 24, discountRate: 8, terminalGrowth: 2.5 },
    bear: { revenueGrowth: 5, operatingMargin: 16, discountRate: 10, terminalGrowth: 1.5 },
  },
  scenarios: {
    base: { fairValue: 145.2 },
    bull: { fairValue: 185.5 },
    bear: { fairValue: 112.3 },
  },
  range: [112.3, 185.5] as [number, number],
  histogram: mockHistogram,
  sensitivityMatrix: mockSensitivityMatrix,
  sensitivity: {
    growthOffsets: [-4, -3, -2, -1, 0, 1, 2, 3, 4],
    waccOffsets: [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2],
  },
  projections: mockProjectionRows,
  kpis: mockKpis,
  statementHistory: mockStatementHistory,
  monteCarloSummary: mockMonteCarloSummary,
  provenance: mockProvenance,
};
