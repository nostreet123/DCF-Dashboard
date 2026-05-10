import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { isMobileProject } from './helpers/ui';

const isDemoDashboardMode = () => process.env.NEXT_PUBLIC_DCF_DASHBOARD_MODE === 'demo';
const usesExternalBaseUrl = () => Boolean(process.env.PLAYWRIGHT_BASE_URL);
const hasConfiguredLiveEngine = () => Boolean(process.env.DCF_ENGINE_URL);
const shouldExpectValuationRefresh = () => isDemoDashboardMode() || hasConfiguredLiveEngine();
const shouldExpectLocalEngineError = () =>
  !usesExternalBaseUrl() && !shouldExpectValuationRefresh();
const hasConfiguredLiveHistoryBackend = () =>
  process.env.NEXT_PUBLIC_VALUATION_HISTORY_BROWSER_READS === '1' &&
  process.env.VALUATION_HISTORY_BROWSER_READS === '1' &&
  Boolean(process.env.CONVEX_URL) &&
  Boolean(process.env.DAMODARAN_SYNC_TOKEN);

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

async function expectSelectedCompany(page: Page, symbol: string) {
  await expect(page.getByRole('banner').getByText(symbol)).toBeVisible();
  if (shouldExpectLocalEngineError()) {
    await expect(page.getByText('Unable to refresh valuation')).toBeVisible();
  } else {
    await expect(page.getByText(`${symbol} Fair Value`)).toBeVisible();
  }
}

test('dashboard loads', async ({ page }, testInfo: TestInfo) => {
  const dashboardApiRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      url.pathname.startsWith('/api/company/') ||
      url.pathname.startsWith('/api/dcf/')
    ) {
      dashboardApiRequests.push(url.pathname);
    }
  });

  await page.goto('/');

  if (isMobileProject(testInfo)) {
    await expect(page.getByRole('button', { name: 'Open library panel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open assumptions panel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open search' })).toBeVisible();
  } else {
    await expect(page.getByRole('button', { name: 'Workbench' })).toBeVisible();
    await expect(page.getByPlaceholder('Search companies...')).toBeVisible();
  }

  if (shouldExpectLocalEngineError()) {
    await expect(page.getByText('Unable to refresh valuation')).toBeVisible();
  } else {
    await expect(page.getByText('AAPL Fair Value')).toBeVisible();
    await expect(page.getByText('BASE CASE')).toBeVisible();
    await expect(page.getByText('Unable to refresh valuation')).toHaveCount(0);
    await expect(page.getByText('Request origin could not be verified')).toHaveCount(0);
  }
  if (process.env.NEXT_PUBLIC_DCF_DASHBOARD_MODE === 'demo') {
    await page.waitForTimeout(500);
    expect(dashboardApiRequests).toEqual([]);
  }
});

test('scenario tabs update state', async ({ page }) => {
  test.skip(shouldExpectLocalEngineError(), 'Requires a configured valuation engine or demo mode.');

  await page.goto('/');

  const base = page.getByRole('button', { name: 'Base' });
  const bull = page.getByRole('button', { name: 'Bull' });

  await expect(base).toHaveAttribute('aria-pressed', 'true');
  await bull.click();
  await expect(bull).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('BULL CASE')).toBeVisible();
});

test('desktop search shows selectable listing-aware results', async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), 'Desktop-only assertion.');

  await page.goto('/');

  const desktopSearch = page.getByPlaceholder('Search companies...');
  await desktopSearch.fill('app');

  const results = page.getByRole('listbox', { name: 'Company search results' });
  await expect(results).toBeVisible();
  await expect(results.getByRole('option', { name: /AAPL/i })).toBeVisible();
  await expect(results.getByText('Valuation ready')).toBeVisible();

  await results.getByRole('option', { name: /AAPL/i }).click();
  await expectSelectedCompany(page, 'AAPL');
  await expect(results).toBeHidden();
});

test('run history click replays the hero card for the selected scenario', async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), 'Desktop-only assertion.');
  test.skip(!isDemoDashboardMode(), 'Demo-only assertion.');

  await page.goto('/');

  const workspace = page.getByRole('main');
  await expect(page.getByText('AAPL Fair Value')).toBeVisible();
  await expect(workspace.getByText('$145.20')).toBeVisible();

  const historyButton = page.getByRole('button', { name: /AAPL \$145\.20/i });
  await expect(historyButton).toBeVisible();
  await historyButton.click();

  await expect(historyButton).toHaveAttribute('aria-pressed', 'true');
  await expect(workspace.getByText('$145.20')).toBeVisible();

  const bull = page.getByRole('button', { name: 'Bull' });
  await bull.click();
  await expect(page.getByText('BULL CASE')).toBeVisible();
  await expect(workspace.locator('[class*="ValueCard_value__"]').getByText('$185.86')).toBeVisible();
});

test('live run history click replays the hero card through browser history routes', async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), 'Desktop-only assertion.');
  test.skip(isDemoDashboardMode(), 'Live-mode assertion.');
  test.skip(
    !hasConfiguredLiveHistoryBackend(),
    'Live browser history routes are not configured for this Playwright run.',
  );

  await mockLiveValuation(page);

  const historyRouteRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/dcf/history/browser')) {
      historyRouteRequests.push(url.pathname);
    }
  });

  const routeProbe = await page.request.get('/api/dcf/history/browser?symbol=AAPL&limit=1');
  expect(routeProbe.status()).toBe(200);
  await expect(routeProbe).toBeOK();
  expect(await routeProbe.json()).toEqual({
    runs: [
      {
        _id: 'run-123',
        createdAt: 1700000000000,
        status: 'success',
        symbol: 'AAPL',
        resultSummary: {
          base: { fairValuePerShare: 222.22 },
        },
      },
    ],
  });

  await page.goto('/');

  const workspace = page.getByRole('main');
  const heroValue = workspace.locator('[class*="ValueCard_value__"]');
  await expect(page.getByText('AAPL Fair Value')).toBeVisible();
  await expect(heroValue.getByText('$42.00')).toBeVisible();

  const historyButton = page.getByRole('button', { name: /AAPL \$222\.22/i });
  await expect(historyButton).toBeVisible();
  await historyButton.click();

  await expect(historyButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('BASE CASE')).toBeVisible();
  await expect(heroValue.getByText('$222.22')).toBeVisible();
  await expect(heroValue.getByText('$42.00')).toBeHidden();
  expect(historyRouteRequests).toEqual(
    expect.arrayContaining(['/api/dcf/history/browser', '/api/dcf/history/browser/run-123']),
  );
});

test('changing company clears the selected historical replay', async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), 'Desktop-only assertion.');
  test.skip(!isDemoDashboardMode(), 'Demo-only assertion.');

  await page.goto('/');

  const workspace = page.getByRole('main');
  const historyButton = page.getByRole('button', { name: /AAPL \$145\.20/i });
  await expect(historyButton).toBeVisible();
  await historyButton.click();

  await expect(historyButton).toHaveAttribute('aria-pressed', 'true');
  await expect(workspace.getByText('$145.20')).toBeVisible();

  const desktopSearch = page.getByPlaceholder('Search companies...');
  await desktopSearch.fill('MSFT');
  await desktopSearch.press('Enter');

  await expect(page.getByText('MSFT Fair Value')).toBeVisible();
  await expect(historyButton).toBeHidden();
  const msftHistoryButton = page.getByRole('button', { name: /MSFT \$378\.50/i });
  await expect(msftHistoryButton).toBeVisible();
  await expect(msftHistoryButton).not.toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Valuation run not found')).toHaveCount(0);
});

test('demo run history never calls internal replay routes', async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), 'Desktop-only assertion.');
  test.skip(!isDemoDashboardMode(), 'Demo-only assertion.');

  const historyRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/dcf/history')) {
      historyRequests.push(url.pathname);
    }
  });

  await page.goto('/');

  const historyButton = page.getByRole('button', { name: /AAPL \$145\.20/i });
  await expect(historyButton).toBeVisible();
  await historyButton.click();

  await expect(historyButton).toBeVisible();
  await expect(historyButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Valuation run not found')).toHaveCount(0);
  expect(historyRequests).toEqual([]);
});

test('demo run history is shown without identity error copy', async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), 'Desktop-only assertion.');
  test.skip(!isDemoDashboardMode(), 'Demo-only assertion.');

  await page.goto('/');

  await expect(page.getByRole('button', { name: /AAPL \$145\.20/i })).toBeVisible();
  await expect(page.getByText('Recent runs are temporarily unavailable')).toHaveCount(0);
  await expect(page.getByText('Request origin could not be verified')).toHaveCount(0);
});

test('rapid company switching does not spam history requests', async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), 'Desktop-only assertion.');
  test.skip(shouldExpectLocalEngineError(), 'Requires seeded recent companies from demo mode or a live engine run.');

  let historyRequests = 0;
  await page.route('**/api/dcf/history**', async (route) => {
    historyRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ runs: [] }),
    });
  });

  await page.goto('/');

  const msftButton = page.getByRole('button', { name: /MSFT.*Microsoft/i });
  const googlButton = page.getByRole('button', { name: /GOOGL.*Alphabet/i });
  const aaplButton = page.getByRole('button', { name: /AAPL.*Apple/i });

  await msftButton.click();
  await googlButton.click();
  await aaplButton.click();
  await page.waitForTimeout(500);

  if (process.env.NEXT_PUBLIC_VALUATION_HISTORY_BROWSER_READS === '1') {
    expect(historyRequests).toBeLessThanOrEqual(2);
  } else {
    expect(historyRequests).toBe(0);
  }
});

test('search selects company', async ({ page }) => {
  await page.goto('/');

  const desktopSearch = page.getByPlaceholder('Search companies...');
  if (await desktopSearch.isVisible()) {
    await desktopSearch.fill('MSFT');
    await desktopSearch.press('Enter');
  } else {
    await page.getByRole('button', { name: 'Open search' }).click();
    await expect(page.getByRole('dialog', { name: 'Search companies' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Search companies' }).fill('MSFT');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
  }

  await expectSelectedCompany(page, 'MSFT');
});

test('sensitivity heatmap stays within the mobile viewport', async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), 'Mobile-only assertion.');
  test.skip(shouldExpectLocalEngineError(), 'Requires a configured valuation engine or demo mode.');

  await page.goto('/');

  const sensitivitySection = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Sensitivity Analysis' }) });
  await expect(sensitivitySection).toBeVisible();

  const lastCell = sensitivitySection.locator('svg rect').last();
  const box = await lastCell.boundingBox();
  const viewport = page.viewportSize();

  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual((viewport?.width ?? 0) - 8);
});

test('search shows inline feedback when no company matches', async ({ page }) => {
  await page.goto('/');

  const desktopSearch = page.getByPlaceholder('Search companies...');
  if (await desktopSearch.isVisible()) {
    await desktopSearch.fill('ZZZZ_UNKNOWN');
    await desktopSearch.press('Enter');
  } else {
    await page.getByRole('button', { name: 'Open search' }).click();
    await expect(page.getByRole('dialog', { name: 'Search companies' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Search companies' }).fill('ZZZZ_UNKNOWN');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
  }

  await expect(page.getByText('No matching company found for "ZZZZ_UNKNOWN".')).toBeVisible();
});

test('search shortcut opens the relevant search surface', async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), 'Desktop-only keyboard shortcut assertion.');

  await page.goto('/');

  const shortcutHint = page.locator('kbd').filter({ hasText: /K/ }).first();
  await expect(shortcutHint).toHaveText(/^(Ctrl\+K|⌘K)$/);
  const hintText = (await shortcutHint.textContent())?.trim();
  await page.evaluate((isMetaShortcut) => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: !isMetaShortcut,
        metaKey: isMetaShortcut,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, hintText === '⌘K');

  const desktopSearch = page.getByPlaceholder('Search companies...');
  await expect(desktopSearch).toBeFocused();
});

test('investor mode is marked unavailable', async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), 'Desktop-only assertion.');

  await page.goto('/');

  const investor = page.getByRole('button', { name: /Investor/i });
  await expect(investor).toBeDisabled();
  await expect(investor).toContainText('Soon');
  await expect(page.getByRole('button', { name: 'Workbench' })).toHaveAttribute('aria-pressed', 'true');
});

test('assumptions slider keeps a visible focus outline', async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), 'Desktop-only assertion.');

  await page.goto('/');

  const slider = page.getByRole('slider', { name: 'Revenue Growth' });
  await slider.focus();
  await expect(slider).toBeFocused();

  const outlineStyle = await slider.evaluate((node) => getComputedStyle(node).outlineStyle);
  expect(outlineStyle).not.toBe('none');
});

test('coverage selector is available in the left rail', async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), 'Desktop-only assertion.');

  await page.goto('/');

  const coveragePanel = page.getByRole('complementary').filter({ hasText: 'Coverage' }).first();
  await expect(coveragePanel.getByRole('button', { name: 'All' })).toBeVisible();
  await expect(coveragePanel.getByRole('button', { name: 'Ready' })).toBeVisible();
  await expect(coveragePanel.getByRole('button', { name: 'Import' })).toBeVisible();
  await expect(coveragePanel.getByRole('button', { name: 'Detail' })).toBeVisible();
  await expect(coveragePanel.getByText('Search results branch into valuation')).toBeVisible();
});
