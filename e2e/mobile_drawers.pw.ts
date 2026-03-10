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

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Assumptions' })).toBeHidden();
});

test('mobile assumptions drawer keeps Ctrl+K trapped inside the modal', async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), 'Mobile-only flow.');

  await page.goto('/');

  const assumptionsDrawer = await openDrawer(page, 'Assumptions');
  const revenueGrowthSlider = assumptionsDrawer.getByRole('slider', { name: 'Revenue Growth' });
  await revenueGrowthSlider.focus();
  await expect(revenueGrowthSlider).toBeFocused();

  await page.keyboard.press('Control+k');

  await expect(page.getByRole('dialog', { name: 'Search companies' })).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Assumptions' })).toBeVisible();
  await expect(revenueGrowthSlider).toBeFocused();
});

test('mobile search overlay closes with escape', async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), 'Mobile-only flow.');

  await page.goto('/');

  const dialog = await openMobileSearch(page);
  await expect(dialog.getByRole('textbox', { name: 'Search companies' })).toBeFocused();

  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.press('Tab');
    const focusInDialog = await page.evaluate(() => {
      const modal = document.querySelector('[role="dialog"][aria-label="Search companies"]');
      return Boolean(modal && document.activeElement && modal.contains(document.activeElement));
    });
    expect(focusInDialog).toBe(true);
  }

  await page.keyboard.press('Shift+Tab');
  const focusInDialog = await page.evaluate(() => {
    const modal = document.querySelector('[role="dialog"][aria-label="Search companies"]');
    return Boolean(modal && document.activeElement && modal.contains(document.activeElement));
  });
  expect(focusInDialog).toBe(true);

  await page.keyboard.press('Escape');

  await expect(page.getByRole('dialog', { name: 'Search companies' })).toBeHidden();
});

test('mobile top bar hides the investor stub and keeps controls clickable', async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), 'Mobile-only flow.');

  await page.goto('/');

  await expect(page.getByRole('button', { name: /Investor.*Soon/i })).toBeHidden();

  const assumptionsDrawer = await openDrawer(page, 'Assumptions');
  await expect(assumptionsDrawer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Assumptions' })).toBeHidden();

  const themeToggle = page.getByRole('button', { name: /Switch to (light|dark) theme/i });
  const beforeLabel = await themeToggle.getAttribute('aria-label');
  await themeToggle.click();
  const expectedLabel =
    beforeLabel === 'Switch to light theme' ? 'Switch to dark theme' : 'Switch to light theme';
  await expect(themeToggle).toHaveAttribute('aria-label', expectedLabel);
});
