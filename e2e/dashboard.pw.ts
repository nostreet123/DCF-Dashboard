import { expect, test } from '@playwright/test';

test('dashboard loads', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Workbench' })).toBeVisible();

  const desktopSearch = page.getByPlaceholder('Search companies...');
  if (await desktopSearch.isVisible()) {
    await expect(desktopSearch).toBeVisible();
  } else {
    await expect(page.getByRole('button', { name: 'Open search' })).toBeVisible();
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
