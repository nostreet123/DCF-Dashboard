import { expect, test } from 'bun:test';
import { resolveDashboardCompanyIdentity } from '../lib/hooks/useWorkbenchViewState';
import { mockDatasets } from '../lib/workbench/mockData';

test('an import candidate keeps its listing ID and ticker in demo mode', () => {
  const company = { id: 'import:NVDA', symbol: 'NVDA', name: 'NVIDIA', coverageState: 'import_required' as const, sourceLinks: [] };
  expect(resolveDashboardCompanyIdentity(mockDatasets, company.id, company.symbol, company)).toEqual({
    activeCompanyId: 'import:NVDA', activeTicker: 'NVDA',
  });
});

test('live selection does not fall back to the demo catalog', () => {
  expect(resolveDashboardCompanyIdentity({}, null, 'MSFT', null)).toEqual({ activeCompanyId: null, activeTicker: 'MSFT' });
});
