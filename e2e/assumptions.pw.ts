import { expect, test } from '@playwright/test';
import { isMobileProject, setRange } from './helpers/ui';

test('desktop assumptions slider triggers recalculation', async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), 'Desktop-only behavior.');

  await page.goto('/');

  const revenueGrowthSlider = page.getByRole('slider', { name: 'Revenue Growth' });
  await setRange(revenueGrowthSlider, 13);

  const recalculating = page.getByText('Recalculating...');
  await expect(recalculating).toBeVisible({ timeout: 3_000 });
  await expect(recalculating).toBeHidden({ timeout: 6_000 });
});
