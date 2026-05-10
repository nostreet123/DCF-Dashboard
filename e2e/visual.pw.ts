import { expect, test } from '@playwright/test';

test('iphone dashboard visual baseline', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-15-pro-max', 'iPhone visual baseline only.');

  await page.goto('/');
  await expect(page.getByText('AAPL Fair Value')).toBeVisible();

  await expect(page).toHaveScreenshot('iphone-dashboard.png', {
    animations: 'disabled',
    caret: 'hide',
    fullPage: true,
  });
});
