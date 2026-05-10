import { defineConfig, devices } from '@playwright/test';
import {
  resolvePlaywrightPort,
  resolvePlaywrightWebServer,
} from './lib/utils/playwrightWebServer';

const port = resolvePlaywrightPort(process.env);
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseUrl ?? `http://localhost:${port}`;
const slowMo = Number(process.env.PLAYWRIGHT_SLOWMO || 0);
const convexFixturePort = Number(process.env.PLAYWRIGHT_CONVEX_FIXTURE_PORT || port + 1);
const usesConvexFixture = !externalBaseUrl && process.env.PLAYWRIGHT_CONVEX_FIXTURE !== '0';
process.env.NEXT_PUBLIC_VALUATION_HISTORY_BROWSER_READS ??= '1';
process.env.VALUATION_HISTORY_BROWSER_READS ??= '1';
if (usesConvexFixture) {
  process.env.CONVEX_URL ??= `http://127.0.0.1:${convexFixturePort}`;
  process.env.DAMODARAN_SYNC_TOKEN ??= 'playwright-sync-token';
  process.env.DCF_RATE_LIMIT_ALLOW_LOCALHOST ??= '1';
}
const webServer = resolvePlaywrightWebServer({
  port,
  externalBaseUrl,
  mode: process.env.PLAYWRIGHT_WEB_SERVER_MODE,
  env: process.env,
});
const createConvexFixtureCommand = () => `node - <<'PLAYWRIGHT_CONVEX_FIXTURE'
const http = require("node:http");
const port = Number(process.env.PLAYWRIGHT_CONVEX_FIXTURE_PORT || ${convexFixturePort});
const syncToken = process.env.DAMODARAN_SYNC_TOKEN || "playwright-sync-token";
const trace = {
  base: {
    valuation: { fairValuePerShare: 222.22 },
    trace: { forecast: { years: [2026], revenue: [130], ebit: [35], nopat: [27], fcff: [22] } },
  },
  bull: {
    valuation: { fairValuePerShare: 333.33 },
    trace: { forecast: { years: [2026], revenue: [150], ebit: [47], nopat: [36], fcff: [30] } },
  },
  bear: {
    valuation: { fairValuePerShare: 111.11 },
    trace: { forecast: { years: [2026], revenue: [110], ebit: [25], nopat: [19], fcff: [15] } },
  },
  monteCarlo: {
    runs: 25000,
    summary: { min: 100, max: 360, mean: 230, median: 222.22, p10: 200, p25: 210, p75: 300, p90: 350 },
    histogram: { binCenters: [220, 260, 300], density: [0.4, 1, 0.6] },
  },
  sensitivity: { growthOffsets: [-0.01, 0, 0.01], waccOffsets: [-0.01, 0, 0.01], values: [] },
  kpis: { kpis: [], history: [] },
};
const run = {
  _id: "run-123",
  _creationTime: 1700000000001,
  createdAt: 1700000000000,
  engineVersion: "workbench-v1",
  status: "success",
  symbol: "AAPL",
  inputs: { scenario: "base" },
  traceStorage: "inline",
  resultSummary: { base: { fairValuePerShare: 222.22 } },
  provenance: { source: "playwright-fixture" },
  trace,
};
const summary = {
  _id: run._id,
  createdAt: run.createdAt,
  status: run.status,
  symbol: run.symbol,
  resultSummary: run.resultSummary,
};
const companies = [
  { _id: "company-aapl", symbol: "AAPL", name: "Apple Inc.", country: "US", currency: "USD" },
  { _id: "company-msft", symbol: "MSFT", name: "Microsoft Corporation", country: "US", currency: "USD" },
  { _id: "company-nvda", symbol: "NVDA", name: "NVIDIA CORP", country: "US", currency: "USD" },
  { _id: "company-googl", symbol: "GOOGL", name: "Alphabet Inc.", country: "US", currency: "USD" },
];
const send = (response, statusCode, body) => {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
};
const sendConvex = (response, value) => send(response, 200, { status: "success", value });
const readBody = (request) => new Promise((resolve, reject) => {
  let body = "";
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => resolve(body));
  request.on("error", reject);
});
const server = http.createServer(async (request, response) => {
  if (request.method === "GET") {
    send(response, 200, { ok: true });
    return;
  }
  if (
    request.method !== "POST" ||
    (!request.url.startsWith("/api/query") && !request.url.startsWith("/api/mutation"))
  ) {
    send(response, 404, { error: "Not found" });
    return;
  }
  try {
    const payload = JSON.parse(await readBody(request) || "{}");
    const args = Array.isArray(payload.args) && payload.args[0] ? payload.args[0] : {};
    if (payload.path === "companies:search") {
      const query = String(args.q || "").toLowerCase();
      const limit = Math.max(1, Math.min(Number(args.limit) || 20, 50));
      sendConvex(
        response,
        companies
          .filter((company) =>
            company.symbol.toLowerCase().includes(query) ||
            company.name.toLowerCase().includes(query)
          )
          .slice(0, limit)
      );
      return;
    }
    if (payload.path === "imports:getImportedFacts") {
      sendConvex(response, null);
      return;
    }
    if (payload.path === "imports:listBySymbol") {
      sendConvex(response, []);
      return;
    }
    if (args.syncToken !== syncToken) {
      send(response, 200, { status: "error", errorMessage: "Invalid sync token" });
      return;
    }
    if (payload.path === "valuations:listByTicker" || payload.path === "valuations:listBySymbol") {
      const identifier = String(args.symbol || args.primaryKeyNorm || "").toLowerCase();
      sendConvex(response, identifier.startsWith("aapl") ? [summary] : []);
      return;
    }
    if (payload.path === "securityRateLimit:hitBucket") {
      sendConvex(response, { allowed: true });
      return;
    }
    if (payload.path === "valuations:get") {
      sendConvex(response, args.runId === run._id ? { run } : null);
      return;
    }
    send(response, 200, { status: "error", errorMessage: "Unexpected query " + payload.path });
  } catch (error) {
    send(response, 500, { error: String(error && error.message ? error.message : error) });
  }
});
server.listen(port, "127.0.0.1");
process.on("SIGINT", () => server.close(() => process.exit(0)));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
PLAYWRIGHT_CONVEX_FIXTURE`;
const isDefined = <T>(value: T | null): value is T => value !== null;
const webServers = [
  usesConvexFixture
    ? {
        name: 'Convex fixture',
        command: createConvexFixtureCommand(),
        env: {
          PLAYWRIGHT_CONVEX_FIXTURE_PORT: String(convexFixturePort),
          DAMODARAN_SYNC_TOKEN: process.env.DAMODARAN_SYNC_TOKEN ?? 'playwright-sync-token',
        },
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        url: `http://127.0.0.1:${convexFixturePort}`,
      }
    : null,
  webServer,
].filter(isDefined);

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
  webServer: webServers.length > 1 ? webServers : webServers[0] ?? undefined,
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
