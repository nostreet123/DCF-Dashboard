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
  { id: 'r1', timestamp: new Date(Date.now() - 3600000), ticker: 'AAPL', value: 145.2 },
  { id: 'r2', timestamp: new Date(Date.now() - 7200000), ticker: 'MSFT', value: 378.5 },
  { id: 'r3', timestamp: new Date(Date.now() - 86400000), ticker: 'GOOGL', value: 142.8 },
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

export function findMockCompanyBySearch(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const allCompanies = Object.values(mockDatasets).flat();
  return (
    allCompanies.find(
      (item) =>
        item.ticker.toLowerCase() === normalized || item.name.toLowerCase().includes(normalized),
    ) ?? null
  );
}
