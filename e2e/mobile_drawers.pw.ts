import { expect, test } from '@playwright/test';
import { isMobileProject, openDrawer, openMobileSearch, setRange } from './helpers/ui';

test('mobile library drawer selects company and closes', async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), 'Mobile-only flow.');

  await page.goto('/');

  const libraryDrawer = await openDrawer(page, 'Dataset Library');
  await libraryDrawer.getByRole('button', { name: /MSFT.*Microsoft/i }).click();

  await expect(page.getByRole('dialog', { name: 'Dataset Library' })).toBeHidden();
  await expect(page.getByText('MSFT Fair Value')).toBeVisible();
});

test('mobile assumptions drawer slider recalculates and closes on escape', async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), 'Mobile-only flow.');

  await page.goto('/');

  const assumptionsDrawer = await openDrawer(page, 'Assumptions');
  const revenueGrowthSlider = assumptionsDrawer.getByRole('slider', { name: 'Revenue Growth' });
  await setRange(revenueGrowthSlider, 13);

  const recalculating = assumptionsDrawer.getByText('Recalculating...');
  await expect(recalculating).toBeVisible({ timeout: 3_000 });
  await expect(recalculating).toBeHidden({ timeout: 6_000 });

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Assumptions' })).toBeHidden();
});

test('mobile search overlay closes with escape', async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), 'Mobile-only flow.');

  await page.goto('/');

  await openMobileSearch(page);
  await page.keyboard.press('Escape');

  await expect(page.getByRole('dialog', { name: 'Search companies' })).toBeHidden();
});
