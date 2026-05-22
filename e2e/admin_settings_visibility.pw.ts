import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { openDrawer, isMobileProject } from './helpers/ui';
import { VALID_ADMIN_TOKEN } from '../test/helpers/adminModeTestToken';

const adminToken = VALID_ADMIN_TOKEN;

const liveFactsFixture = {
  symbol: 'AAPL',
  name: 'Apple Inc.',
  currency: 'USD',
  statements: [
    {
      period_end: '2025-09-30',
      period_type: 'FY',
      filing_date: '2025-11-01',
      revenue: 120,
      operating_income: 36,
      operating_margin: 0.3,
      cash: 11,
      debt: 19,
      shares_outstanding: 9,
    },
  ],
};

const liveDcfFixture = {
  base: {
    valuation: { fairValuePerShare: 42 },
    trace: {
      forecast: {
        years: [2026, 2027],
        revenue: [130, 140],
        ebit: [35, 38],
        nopat: [27, 29],
        fcff: [22, 24],
      },
    },
  },
  bull: { valuation: { fairValuePerShare: 55 } },
  bear: { valuation: { fairValuePerShare: 31 } },
  sensitivity: {
    growthOffsets: [-0.01, 0, 0.01],
    waccOffsets: [-0.01, 0, 0.01],
    values: [
      [35, 38, 41],
      [39, 42, 45],
      [43, 46, 49],
    ],
  },
  kpis: {
    kpis: [
      { key: 'margin', label: 'EBIT Margin', value: 30, score: 75, direction: 'higher', unit: '%' },
    ],
    history: [
      { periodEnd: '2025-09-30', revenue: 120, operatingIncome: 36, operatingMargin: 0.3 },
    ],
  },
  monteCarlo: {
    runs: 25000,
    summary: { min: 20, max: 70, mean: 44, median: 43, p10: 30, p25: 36, p75: 50, p90: 55 },
    histogram: { binCenters: [35, 42, 50], density: [0.4, 1, 0.6] },
  },
};

async function mockLiveValuation(page: Page) {
  await page.route('**/api/company/facts?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(liveFactsFixture),
    });
  });
  await page.route('**/api/dcf/preview?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(liveDcfFixture),
    });
  });
}

async function getAdminTokenInput(page: Page, testInfo: TestInfo) {
  if (isMobileProject(testInfo)) {
    const drawer = page.getByRole('dialog', { name: 'Assumptions' });
    return drawer.getByLabel('AI admin token');
  }
  return page.getByLabel('AI admin token');
}

async function openAdminModeEntry(page: Page, testInfo: TestInfo) {
  if (isMobileProject(testInfo)) {
    const drawer = await openDrawer(page, 'Assumptions');
    await drawer.getByText('Admin mode', { exact: true }).click();
    return;
  }
  await page.getByText('Admin mode', { exact: true }).click();
}

test.describe('admin settings visibility', () => {
  test.use({
    extraHTTPHeaders: {},
  });

  test.beforeEach(async ({ page }) => {
    await mockLiveValuation(page);
    await page.goto('/');
    await expect(page.getByText('AAPL Fair Value')).toBeVisible({ timeout: 30_000 });
  });

  test('hides settings status in public mode and reveals it after admin token entry', async ({
    page,
  }, testInfo) => {
    const settingsHeading = page.getByRole('heading', { name: 'Settings Status' });

    await expect(settingsHeading).toHaveCount(0);
    await openAdminModeEntry(page, testInfo);
    const adminTokenInput = await getAdminTokenInput(page, testInfo);
    await expect(adminTokenInput).toBeVisible();
    await adminTokenInput.fill(adminToken);
    await expect(settingsHeading).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Server-side readiness for official data, imports, AI, and saved runs.')).toBeVisible();
  });
});
