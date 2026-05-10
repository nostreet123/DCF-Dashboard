import { expect, test, type TestInfo } from '@playwright/test';
import { isMobileProject } from './helpers/ui';

const isDemoDashboardMode = () => process.env.NEXT_PUBLIC_DCF_DASHBOARD_MODE === 'demo';
const usesExternalBaseUrl = () => Boolean(process.env.PLAYWRIGHT_BASE_URL);
const hasConfiguredLiveEngine = () => Boolean(process.env.DCF_ENGINE_URL);
const shouldExpectValuationRefresh = () => isDemoDashboardMode() || hasConfiguredLiveEngine();
const shouldExpectLocalEngineError = () =>
  !usesExternalBaseUrl() && !shouldExpectValuationRefresh();

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
  await expect(page.getByText('AAPL Fair Value')).toBeVisible();
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

  await expect(page.getByText('MSFT Fair Value')).toBeVisible();
});

test('sensitivity heatmap stays within the mobile viewport', async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), 'Mobile-only assertion.');

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

test('region selector is marked unavailable', async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), 'Desktop-only assertion.');

  await page.goto('/');

  await expect(page.getByText('Regional filtering unavailable in this prototype.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'US' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'EU' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'APAC' })).toBeDisabled();
});
