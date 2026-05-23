/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";

import { shouldShowSettingsStatusPanel } from "../lib/settingsStatus";

const sampleStatus = {
  secUserAgent: { configured: true },
  ai: { configured: true, model: "test/model", adminModeAvailable: true },
  convex: {
    configured: true,
    syncTokenConfigured: true,
    historyReady: true,
    importsReady: true,
  },
  dataMode: "live" as const,
};

describe("settings status panel visibility", () => {
  test("hides the panel in demo mode even when admin mode is enabled", () => {
    expect(
      shouldShowSettingsStatusPanel({
        isDemoMode: true,
        aiAdminModeEnabled: true,
        settingsStatus: sampleStatus,
      }),
    ).toBe(false);
  });

  test("hides the panel in public live mode without admin mode", () => {
    expect(
      shouldShowSettingsStatusPanel({
        isDemoMode: false,
        aiAdminModeEnabled: false,
        settingsStatus: null,
      }),
    ).toBe(false);
  });

  test("hides the panel when admin mode is enabled but status has not loaded", () => {
    expect(
      shouldShowSettingsStatusPanel({
        isDemoMode: false,
        aiAdminModeEnabled: true,
        settingsStatus: null,
      }),
    ).toBe(false);
  });

  test("shows the panel after admin mode loads a status payload", () => {
    expect(
      shouldShowSettingsStatusPanel({
        isDemoMode: false,
        aiAdminModeEnabled: true,
        settingsStatus: sampleStatus,
      }),
    ).toBe(true);
  });
});
