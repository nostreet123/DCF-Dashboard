import { expect, test } from '@playwright/test';

test('charts test route renders and theme toggle updates document theme', async ({ page }) => {
  await page.goto('/charts-test');

  await expect(page.getByRole('heading', { name: 'Chart Components Test' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  const themeToggle = page.getByRole('button', { name: 'Switch to light theme' });
  await expect(themeToggle).toBeVisible();
  await themeToggle.click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible();
  await expect(page.getByText('Toggle theme to test dark/light mode rendering')).toBeVisible();
});
