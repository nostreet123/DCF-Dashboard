import { defineConfig, devices } from '@playwright/test';
import {
  resolvePlaywrightPort,
  resolvePlaywrightWebServer,
} from './lib/utils/playwrightWebServer';

const port = resolvePlaywrightPort(process.env);
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseUrl ?? `http://localhost:${port}`;
const slowMo = Number(process.env.PLAYWRIGHT_SLOWMO || 0);
const webServer = resolvePlaywrightWebServer({
  port,
  externalBaseUrl,
  mode: process.env.PLAYWRIGHT_WEB_SERVER_MODE,
  env: process.env,
});

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.pw.ts',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: {
      slowMo,
    },
  },
  webServer: webServer ?? undefined,
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 5'],
      },
    },
    {
      name: 'iphone-15-pro-max',
      use: {
        ...devices['iPhone 15 Pro Max'],
        browserName: 'chromium',
      },
    },
  ],
});
