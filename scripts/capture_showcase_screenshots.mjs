#!/usr/bin/env node
/**
 * Capture public showcase screenshots from demo mode.
 * Usage: PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 node scripts/capture_showcase_screenshots.mjs
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000';
const outDir = path.join(process.cwd(), 'docs', 'assets');

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(60_000);

  await page.goto(`${baseURL}/`);
  await page.getByText('AAPL Fair Value').waitFor();
  await page.screenshot({ path: path.join(outDir, 'dashboard-home.png') });

  const assumptionsPanel = page.getByRole('complementary').filter({ has: page.getByRole('slider') }).first();
  if (await assumptionsPanel.isVisible().catch(() => false)) {
    await assumptionsPanel.screenshot({ path: path.join(outDir, 'assumptions-panel.png') });
  } else {
    await page.getByRole('slider').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(outDir, 'assumptions-panel.png') });
  }

  await page.getByRole('button', { name: 'Bull' }).click();
  await page.getByText('BULL CASE').waitFor();
  await page.screenshot({ path: path.join(outDir, 'valuation-flow.png') });

  const distribution = page.getByText(/Distribution|Monte Carlo|p10/i).first();
  if (await distribution.isVisible().catch(() => false)) {
    await distribution.scrollIntoViewIfNeeded();
  } else {
    await page.getByRole('main').locator('svg').last().scrollIntoViewIfNeeded();
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, 'monte-carlo-output.png') });

  await browser.close();
  console.log(`Wrote screenshots to ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
