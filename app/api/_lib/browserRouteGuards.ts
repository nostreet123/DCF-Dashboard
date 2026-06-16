export const RATE_LIMIT_IDENTITY_HEADERS = [
  "x-vercel-forwarded-for",
  "cf-connecting-ip",
  "x-real-ip",
] as const;

export const isProductionRuntime = (): boolean =>
  process.env.NODE_ENV === "production";

export const publicPreviewUnsafeBrowserModesAllowed = (): boolean =>
  !isProductionRuntime() ||
  process.env.DCF_PUBLIC_PREVIEW_ALLOW_BROWSER_DEBUG_ROUTES === "1";

export const browserHistoryReadsEnabled = (): boolean =>
  process.env.VALUATION_HISTORY_BROWSER_READS === "1" &&
  publicPreviewUnsafeBrowserModesAllowed();

export const browserImportContextReadsEnabled = (): boolean =>
  browserHistoryReadsEnabled();

export const browserCompanyFactsReadsEnabled = (): boolean =>
  browserHistoryReadsEnabled();

export const browserImportApprovalWritesEnabled = (): boolean =>
  process.env.IMPORT_APPROVAL_BROWSER_WRITES === "1" &&
  publicPreviewUnsafeBrowserModesAllowed();

export const copyRateLimitIdentityHeaders = (
  source: Request,
  target: Headers,
): void => {
  for (const headerName of RATE_LIMIT_IDENTITY_HEADERS) {
    const value = source.headers.get(headerName);
    if (value) {
      target.set(headerName, value);
    }
  }
};

export const setRateLimitIdentityHeaders = (
  headers: Headers,
  values: Partial<Record<(typeof RATE_LIMIT_IDENTITY_HEADERS)[number], string>>,
): void => {
  for (const headerName of RATE_LIMIT_IDENTITY_HEADERS) {
    const value = values[headerName];
    if (value) {
      headers.set(headerName, value);
    }
  }
};

const collectEnabledBrowserFlags = (): string[] => {
  const enabled: string[] = [];
  if (process.env.VALUATION_HISTORY_BROWSER_READS === "1") {
    enabled.push("VALUATION_HISTORY_BROWSER_READS");
  }
  if (process.env.IMPORT_APPROVAL_BROWSER_WRITES === "1") {
    enabled.push("IMPORT_APPROVAL_BROWSER_WRITES");
  }
  if (process.env.NEXT_PUBLIC_VALUATION_HISTORY_BROWSER_READS === "1") {
    enabled.push("NEXT_PUBLIC_VALUATION_HISTORY_BROWSER_READS");
  }
  return enabled;
};

export const warnUnsafeBrowserDebugInProduction = (): void => {
  if (!isProductionRuntime()) {
    return;
  }
  if (process.env.DCF_PUBLIC_PREVIEW_ALLOW_BROWSER_DEBUG_ROUTES !== "1") {
    return;
  }
  const enabledFlags = collectEnabledBrowserFlags();
  if (enabledFlags.length === 0) {
    return;
  }
  console.error(
    "[DCF] Unsafe production browser debug configuration: " +
      "DCF_PUBLIC_PREVIEW_ALLOW_BROWSER_DEBUG_ROUTES=1 with " +
      `${enabledFlags.join(", ")}. Leave these flags unset on hosted public deployments.`,
  );
};

warnUnsafeBrowserDebugInProduction();
