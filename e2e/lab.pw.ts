import { expect, test, type Page } from '@playwright/test';

const isDemo = process.env.NEXT_PUBLIC_DCF_DASHBOARD_MODE === 'demo';

async function liveFixtures(page: Page, currency = 'USD') {
  const symbols: string[] = [];
  let computes = 0;
  let failNext = false;
  await page.route('**/api/company/facts?**', async (route) => {
    const query = new URL(route.request().url()).searchParams;
    const symbol = query.get('symbol') ?? 'AAPL';
    symbols.push(symbol);
    await route.fulfill({ json: {
      symbol, name: symbol === 'MSFT' ? 'Microsoft Corporation' : symbol === 'NVDA' ? 'NVIDIA Corp.' : 'Apple Inc.',
      currency: 'USD', filingCurrency: currency, statements: [{ period_end: '2025-12-31', period_type: 'FY', revenue: 100, cash: 10, debt: 50, shares_outstanding: 10 }],
    } });
  });
  await page.route('**/api/dcf/preview?**', async (route) => {
    computes += 1;
    if (failNext) {
      failNext = false;
      await route.fulfill({ status: 503, json: { message: 'Engine unavailable' } });
      return;
    }
    const input = route.request().postDataJSON();
    expect(input.currency).toBe(currency);
    expect(input.periods).toBe(10);
    const fair = input.base.revenueGrowth > 0.12 ? 110 : 100;
    const scenario = (value: number) => ({
      valuation: { fairValuePerShare: value },
      trace: {
        discounting: { pv_fcff: [-31.8, -31.8], pv_terminal: value * 10 + 103.6 },
        bridge: { cash: 10, debt: 50, equity_value: value * 10, shares_outstanding: 10 },
        forecast: { years: Array.from({ length: input.periods }, (_, i) => 2026 + i), revenue: Array(input.periods).fill(500_000), ebit: Array(input.periods).fill(100_000), nopat: Array(input.periods).fill(75_000), fcff: Array(input.periods).fill(-35) },
      },
    });
    await route.fulfill({ json: {
      base: scenario(fair), bull: scenario(fair + 30), bear: scenario(fair - 20),
      sensitivity: { growthOffsets: [-0.02, -0.01, 0, 0.01, 0.02], waccOffsets: [-0.01, -0.005, 0, 0.005, 0.01], values: Array.from({ length: 5 }, () => Array(5).fill(fair)) },
      kpis: { history: [{ periodEnd: '2025-12-31', revenue: 100, cash: 10, debt: 50, sharesOutstanding: 10 }], kpis: [] },
    } });
  });
  return { symbols, count: () => computes, fail: () => { failNext = true; } };
}

test.describe('live Lab', () => {
  test.skip(isDemo, 'Live data contract');

  test('root recalculates once per edit, exposes the grid, and shows refresh errors', async ({ page }) => {
    const requests = await liveFixtures(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('$100.00');
    expect(requests.count()).toBe(1);
    const table = page.getByRole('table', { name: 'Sensitivity grid of fair values' });
    await expect(table.getByRole('cell')).toHaveCount(25);
    await expect(table.getByRole('columnheader')).toHaveCount(6);
    await expect(table.getByRole('rowheader')).toHaveCount(5);
    await expect(page.getByText('−0.000000064', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Raise revenue growth', exact: true }).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('$110.00');
    expect(requests.count()).toBe(2);
    requests.fail();
    await page.getByRole('button', { name: 'Raise revenue growth', exact: true }).first().click();
    await expect(page.getByRole('region', { name: 'Valuation error' }).getByRole('alert')).toBeVisible();
    await expect(page.getByRole('heading', { name: /looks worth/ })).toHaveCount(0);
    expect(requests.count()).toBe(3);
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('$110.00');
    expect(requests.count()).toBe(4);
  });

  test('EUR memo labels ten years and uses consistent billions throughout', async ({ page }) => {
    await liveFixtures(page, 'EUR');
    await page.goto('/?ticker=MSFT');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('€100.00');
    await expect(page.getByText(/a year for 10 years/)).toBeVisible();
    await expect(page.getByText('PV of 10-year cash flow', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'The 10 years modeled' })).toBeVisible();
    await expect(page.getByText('0.0005', { exact: true })).toHaveCount(10);
    const table = page.getByRole('table', { name: 'Sensitivity grid of fair values' });
    await expect(table.getByRole('cell').first()).toHaveText('€100');
    await expect(page.getByText(/USD billions/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Base · €/ })).toBeVisible();
  });

  test('missing reporting currency prevents compute, hides stale values, and explains recovery', async ({ page }) => {
    const requests = await liveFixtures(page, 'EUR');
    let hasCurrency = false;
    await page.route('**/api/company/facts?**', (route) => route.fulfill({ json: {
      symbol: 'MSFT', name: 'Microsoft Corporation',
      ...(hasCurrency ? { filingCurrency: ' eur ' } : {}),
      statements: [{ period_end: '2025-12-31', period_type: 'FY', revenue: 100, cash: 10, debt: 50, shares_outstanding: 10 }],
    } }));
    await page.goto('/?ticker=MSFT');
    await expect(page.getByRole('region', { name: 'Valuation error' }).getByRole('alert')).toContainText('MSFT reporting currency is missing');
    await expect(page.getByRole('heading', { name: /looks worth/ })).toHaveCount(0);
    await expect(page.getByText('USD billions', { exact: true })).toHaveCount(0);
    expect(requests.count()).toBe(0);
    hasCurrency = true;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('€100.00');
    expect(requests.count()).toBe(1);
    hasCurrency = false;
    await page.getByRole('button', { name: 'Raise revenue growth', exact: true }).first().click();
    await expect(page.getByRole('region', { name: 'Valuation error' }).getByRole('alert')).toContainText('MSFT reporting currency is missing');
    await expect(page.getByRole('heading', { name: /looks worth/ })).toHaveCount(0);
    expect(requests.count()).toBe(1);
    hasCurrency = true;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('€110.00');
    expect(requests.count()).toBe(2);
  });

  test('a live ticker rerun computes the requested company without an Apple request', async ({ page }) => {
    const requests = await liveFixtures(page);
    await page.goto('/?ticker=MSFT&rerun=1');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Microsoft');
    expect(requests.symbols).toEqual(['MSFT']);
    expect(requests.count()).toBe(1);
  });

  test('live library and history never advertise mock saved runs', async ({ page }) => {
    await page.goto('/library');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The live library is in the workbench');
    await expect(page.getByText('Apple Inc.', { exact: true })).toHaveCount(0);
    await page.goto('/history');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Saved live memos are in the workbench');
    await expect(page.getByRole('button', { name: /MSFT|GOOGL/ })).toHaveCount(0);
  });

  for (const ticker of ['NVDA', 'MSFT']) {
    test(`${ticker} import approval removes the route status and renders the imported company`, async ({ page }) => {
      const requests = await liveFixtures(page);
      const company = { id: `import:${ticker}`, symbol: ticker, name: ticker === 'NVDA' ? 'NVIDIA Corp.' : 'Microsoft Corporation', coverageState: 'import_required', sourceLinks: [] };
      await page.route('**/api/company/detail?**', (route) => route.fulfill({ json: company }));
      await page.route('**/api/company/import/parse?**', async (route) => {
        expect(new URL(route.request().url()).searchParams.get('listingId')).toBe(`import:${ticker}`);
        await route.fulfill({ json: { artifacts: [], review: {
          isValuationReady: true, missingRequiredFields: [], notes: [],
          fields: Object.entries({ periodEnd: '2025-12-31', filingCurrency: 'USD', revenue: '100', cash: '10', debt: '50', sharesOutstanding: '10' }).map(([field, value]) => ({ field, value, confirmed: true, isManualOverride: false })),
        } } });
      });
      await page.route('**/api/company/import/approve/browser', async (route) => {
        expect(route.request().postDataJSON().company.id).toBe(`import:${ticker}`);
        await route.fulfill({ json: { result: { success: true } } });
      });
      await page.goto(`/?status=import&ticker=${ticker}`);
      await page.getByRole('button', { name: 'Import and review' }).click();
      await page.locator('input[type=file]').setInputFiles({ name: 'statement.csv', mimeType: 'text/csv', buffer: Buffer.from('revenue\n100') });
      await page.getByRole('button', { name: 'Parse Files' }).click();
      await page.getByRole('button', { name: 'Approve And Compute' }).click();
      await expect(page).toHaveURL(new RegExp(`\\/\\?ticker=${ticker}$`));
      await expect(page.getByRole('heading', { level: 1 })).toContainText(ticker === 'NVDA' ? 'NVIDIA' : 'Microsoft');
      expect(requests.symbols).toEqual([ticker]);
      expect(requests.count()).toBe(1);
    });
  }
});

test.describe('demo Lab', () => {
  test.skip(!isDemo, 'Explicit demo data contract');

  test('Apple has a full memo and a semantic sensitivity table', async ({ page }) => {
    await page.goto('/lab');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Apple looks worth $145.20');
    await expect(page.getByRole('table').getByRole('cell')).toHaveCount(25);
  });

  test('the saved demo snapshot keeps assumptions and values fixed on desktop and mobile', async ({ page }) => {
    let computes = 0;
    page.on('request', (request) => { if (request.url().includes('/api/dcf/preview')) computes += 1; });
    await page.goto('/');
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(page.getByText('Demo snapshot: assumptions and values are fixed.')).toBeVisible();
      for (const step of await page.getByRole('button', { name: /^(Raise|Lower) / }).all()) {
        await expect(step).toBeDisabled();
      }
      for (const name of ['Bear', 'Base', 'Bull']) {
        await expect(page.getByRole('button', { name: new RegExp('^' + name + ' ·') })).toBeDisabled();
      }
      await page.getByRole('button', { name: 'Raise revenue growth', exact: true }).first()
        .evaluate((button: HTMLButtonElement) => button.click());
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Apple looks worth $145.20');
      await expect(page.getByText('Your case', { exact: true })).toHaveCount(0);
    }
    expect(computes).toBe(0);
  });

  test('result-only entries cannot open or rerun an Apple memo', async ({ page }) => {
    await page.goto('/history');
    await page.getByRole('button', { name: /MSFT/ }).click();
    await expect(page.getByText(/No assumptions or full memo were saved/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open this memo' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Rerun/ })).toHaveCount(0);
    await page.goto('/?run=r2');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('This demo memo is unavailable');
  });

  test('unsupported tickers and imports do not show Apple data or upload controls', async ({ page }) => {
    await page.goto('/?ticker=GOOGL');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('This demo memo is unavailable');
    await page.goto('/?status=import&ticker=NVDA');
    await expect(page.locator('input[type=file]')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('This demo memo is unavailable');
    await page.goto('/library');
    await expect(page.getByRole('link', { name: 'Open memo', exact: true })).toHaveCount(1);
  });
});
