import type { CompanySearchResult, CoverageState } from '@/lib/contracts/company';

export type WorkspaceMode = 'valuation' | 'import' | 'detail';

export type DashboardCompanySelection = {
  company: CompanySearchResult | null;
  symbol: string | null;
  listingId: string | null;
  runId: string | null;
};

export type DashboardSettingsStatus = {
  secUserAgent?: { configured: boolean };
  ai?: { configured: boolean; model?: string | null };
  convex?: {
    configured: boolean;
    syncTokenConfigured: boolean;
    historyReady: boolean;
    importsReady: boolean;
  };
  dataMode?: string;
};

export type DashboardCoverageFilter = CoverageState | 'all';

export type DashboardAiAnalysisStatus = 'idle' | 'loading' | 'applied' | 'error';

export type DashboardViewModel = {
  workspaceMode: WorkspaceMode;
  company: DashboardCompanySelection;
  coverageFilter: DashboardCoverageFilter;
  settingsStatus: DashboardSettingsStatus | null;
  aiAnalysisStatus: DashboardAiAnalysisStatus;
};

export const normalizeCoverageState = (value: unknown): CoverageState => {
  if (value === 'import_required' || value === 'detail_only') {
    return value;
  }
  return 'valuation_ready';
};

export const normalizeCompanySearchResult = (
  raw: Record<string, unknown>,
  fallbackSymbol = '',
): CompanySearchResult => {
  const symbol =
    (typeof raw.symbol === 'string' ? raw.symbol : null) ??
    (typeof raw.ticker === 'string' ? raw.ticker : null) ??
    fallbackSymbol;
  const id =
    (typeof raw.id === 'string' ? raw.id : null) ??
    (typeof raw._id === 'string' ? raw._id : null) ??
    (typeof raw.listing_id === 'string' ? raw.listing_id : null) ??
    (typeof raw.listingID === 'string' ? raw.listingID : null) ??
    (symbol ? `search:${symbol}` : 'search:unknown');

  const coverageState = normalizeCoverageState(
    raw.coverageState ?? raw.coverage_state,
  );

  const sourceLinks = Array.isArray(raw.sourceLinks)
    ? raw.sourceLinks.flatMap((link) => {
        if (!link || typeof link !== 'object' || Array.isArray(link)) {
          return [];
        }
        const record = link as Record<string, unknown>;
        const title = typeof record.title === 'string' ? record.title : null;
        const url = typeof record.url === 'string' ? record.url : null;
        return title && url ? [{ title, url }] : [];
      })
    : [];

  return {
    id,
    symbol,
    name: typeof raw.name === 'string' ? raw.name : 'Unknown company',
    exchangeMic:
      (typeof raw.exchangeMic === 'string' ? raw.exchangeMic : null) ??
      (typeof raw.mic === 'string' ? raw.mic : null) ??
      (typeof raw.exchange === 'string' ? raw.exchange : null),
    market:
      (typeof raw.market === 'string' ? raw.market : null) ??
      (typeof raw.exchange === 'string' ? raw.exchange : null),
    country:
      (typeof raw.country === 'string' ? raw.country : null) ??
      (typeof raw.country_code === 'string' ? raw.country_code : null) ??
      (typeof raw.countryCode === 'string' ? raw.countryCode : null),
    currency: typeof raw.currency === 'string' ? raw.currency : null,
    coverageState,
    coverageReason:
      (typeof raw.coverageReason === 'string' ? raw.coverageReason : null) ??
      (typeof raw.coverage_reason === 'string' ? raw.coverage_reason : null),
    logoUrl: typeof raw.logoUrl === 'string' ? raw.logoUrl : null,
    sourceLinks,
  };
};
