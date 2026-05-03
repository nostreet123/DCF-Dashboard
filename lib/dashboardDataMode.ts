export type DashboardDataMode = 'demo' | 'live';

export function getDashboardDataMode(): DashboardDataMode {
  return process.env.NEXT_PUBLIC_DCF_DASHBOARD_MODE === 'live' ? 'live' : 'demo';
}

export function areBrowserHistoryReadsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_VALUATION_HISTORY_BROWSER_READS === '1';
}
