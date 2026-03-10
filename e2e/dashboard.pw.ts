import { expect, test, type TestInfo } from '@playwright/test';
import { isMobileProject } from './helpers/ui';

test('dashboard loads', async ({ page }, testInfo: TestInfo) => {
  await page.goto('/');

  if (isMobileProject(testInfo)) {
    await expect(page.getByRole('button', { name: 'Open library panel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open assumptions panel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open search' })).toBeVisible();
  } else {
    await expect(page.getByRole('button', { name: 'Workbench' })).toBeVisible();
    await expect(page.getByPlaceholder('Search companies...')).toBeVisible();
  }

  await expect(page.getByText('AAPL Fair Value')).toBeVisible();
  await expect(page.getByText('BASE CASE')).toBeVisible();
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
