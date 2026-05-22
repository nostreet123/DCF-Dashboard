import type { DashboardDataMode } from "@/lib/dashboardDataMode";

export type SettingsStatus = {
  secUserAgent?: { configured: boolean };
  ai?: { configured: boolean; model?: string | null; adminModeAvailable?: boolean };
  convex?: {
    configured: boolean;
    syncTokenConfigured: boolean;
    historyReady: boolean;
    importsReady: boolean;
  };
  dataMode?: DashboardDataMode;
};

export function shouldShowSettingsStatusPanel({
  isDemoMode,
  aiAdminModeEnabled,
  settingsStatus,
}: {
  isDemoMode: boolean;
  aiAdminModeEnabled: boolean;
  settingsStatus: SettingsStatus | null;
}): boolean {
  return !isDemoMode && aiAdminModeEnabled && settingsStatus !== null;
}
