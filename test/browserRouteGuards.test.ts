import { afterEach, describe, expect, test } from "bun:test";

const originalNodeEnv = process.env.NODE_ENV;
const originalDebugRoutes = process.env.DCF_PUBLIC_PREVIEW_ALLOW_BROWSER_DEBUG_ROUTES;
const originalHistoryReads = process.env.VALUATION_HISTORY_BROWSER_READS;
const originalImportWrites = process.env.IMPORT_APPROVAL_BROWSER_WRITES;
const originalPublicHistoryReads = process.env.NEXT_PUBLIC_VALUATION_HISTORY_BROWSER_READS;

const loadGuardsModule = async () => {
  return import("../app/api/_lib/browserRouteGuards");
};

afterEach(() => {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
  if (originalDebugRoutes === undefined) {
    delete process.env.DCF_PUBLIC_PREVIEW_ALLOW_BROWSER_DEBUG_ROUTES;
  } else {
    process.env.DCF_PUBLIC_PREVIEW_ALLOW_BROWSER_DEBUG_ROUTES = originalDebugRoutes;
  }
  if (originalHistoryReads === undefined) {
    delete process.env.VALUATION_HISTORY_BROWSER_READS;
  } else {
    process.env.VALUATION_HISTORY_BROWSER_READS = originalHistoryReads;
  }
  if (originalImportWrites === undefined) {
    delete process.env.IMPORT_APPROVAL_BROWSER_WRITES;
  } else {
    process.env.IMPORT_APPROVAL_BROWSER_WRITES = originalImportWrites;
  }
  if (originalPublicHistoryReads === undefined) {
    delete process.env.NEXT_PUBLIC_VALUATION_HISTORY_BROWSER_READS;
  } else {
    process.env.NEXT_PUBLIC_VALUATION_HISTORY_BROWSER_READS = originalPublicHistoryReads;
  }
});

describe("browserRouteGuards production warnings", () => {
  test("warnUnsafeBrowserDebugInProduction logs when debug flags are enabled", async () => {
    process.env.NODE_ENV = "production";
    process.env.DCF_PUBLIC_PREVIEW_ALLOW_BROWSER_DEBUG_ROUTES = "1";
    process.env.VALUATION_HISTORY_BROWSER_READS = "1";
    delete process.env.IMPORT_APPROVAL_BROWSER_WRITES;
    delete process.env.NEXT_PUBLIC_VALUATION_HISTORY_BROWSER_READS;

    const errorSpy = (console.error = (() => {}) as typeof console.error);
    let captured = "";
    console.error = ((message?: unknown) => {
      captured = String(message ?? "");
    }) as typeof console.error;

    const { warnUnsafeBrowserDebugInProduction } = await loadGuardsModule();
    warnUnsafeBrowserDebugInProduction();

    console.error = errorSpy;
    expect(captured).toContain("Unsafe production browser debug configuration");
    expect(captured).toContain("VALUATION_HISTORY_BROWSER_READS");
  });

  test("warnUnsafeBrowserDebugInProduction stays quiet outside production", async () => {
    process.env.NODE_ENV = "development";
    process.env.DCF_PUBLIC_PREVIEW_ALLOW_BROWSER_DEBUG_ROUTES = "1";
    process.env.VALUATION_HISTORY_BROWSER_READS = "1";

    const errorSpy = (console.error = (() => {}) as typeof console.error);
    let captured = "";
    console.error = ((message?: unknown) => {
      captured = String(message ?? "");
    }) as typeof console.error;

    const { warnUnsafeBrowserDebugInProduction } = await loadGuardsModule();
    warnUnsafeBrowserDebugInProduction();

    console.error = errorSpy;
    expect(captured).toBe("");
  });
});
