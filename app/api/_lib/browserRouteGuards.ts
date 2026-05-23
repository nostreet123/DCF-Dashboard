export const RATE_LIMIT_IDENTITY_HEADERS = [
  "x-vercel-forwarded-for",
  "cf-connecting-ip",
  "x-real-ip",
] as const;

export const browserHistoryReadsEnabled = (): boolean =>
  process.env.VALUATION_HISTORY_BROWSER_READS === "1";

export const browserImportContextReadsEnabled = (): boolean =>
  browserHistoryReadsEnabled();

export const browserCompanyFactsReadsEnabled = (): boolean =>
  browserHistoryReadsEnabled();

export const browserImportApprovalWritesEnabled = (): boolean =>
  process.env.IMPORT_APPROVAL_BROWSER_WRITES === "1";

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
