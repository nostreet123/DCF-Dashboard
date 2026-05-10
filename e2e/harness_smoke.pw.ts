import { expect, test } from '@playwright/test';

const factsPayload = (symbol: string) => ({
  symbol,
  currency: 'USD',
  statements: [
    {
      period_end: '2024-12-31',
      period_type: 'FY',
      revenue: 100,
      cash: 10,
      debt: 20,
      shares_outstanding: 10,
    },
  ],
});

const computePayload = {
  base: { valuation: { fairValuePerShare: 145.2 } },
  bull: { valuation: { fairValuePerShare: 185.5 } },
  bear: { valuation: { fairValuePerShare: 112.3 } },
  sensitivity: {
    values: [
      [95, 105, 115, 125, 135],
      [105, 118, 130, 142, 155],
      [115, 130, 145, 160, 175],
      [125, 142, 160, 178, 195],
      [135, 155, 175, 195, 215],
    ],
  },
  monteCarlo: {
    summary: { p10: 112.3, p90: 185.5 },
    histogram: {
      binCenters: [120, 140, 160],
      density: [0.25, 1, 0.35],
    },
  },
};

test('dashboard harness smoke', async ({ page }) => {
  await page.route('**/api/company/facts?**', async (route) => {
    const url = new URL(route.request().url());
    const symbol = url.searchParams.get('symbol') ?? 'AAPL';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(factsPayload(symbol)),
    });
  });

  await page.route('**/api/dcf/preview', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(computePayload),
    });
  });

  await page.route('**/api/dcf/history?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ runs: [] }),
    });
  });

  await page.goto('/');

  await expect(page.getByText('DCF Lab')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Workbench' })).toBeVisible();
  await expect(page.getByPlaceholder('Search companies...')).toBeVisible();
  await expect(page.getByText('AAPL Fair Value')).toBeVisible();

  const bull = page.getByRole('button', { name: 'Bull' });
  await bull.click();
  await expect(bull).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('BULL CASE')).toBeVisible();

  await page.getByRole('button', { name: /MSFT.*Microsoft/i }).click();
  await expect(page.getByRole('banner').getByText('MSFT')).toBeVisible();
  await expect(page.getByText('MSFT Fair Value')).toBeVisible();
});
