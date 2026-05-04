export type CompanyCoverageState = 'valuation_ready' | 'search_only' | 'detail_only';

export interface CompanySearchResult {
  _id?: string;
  id?: string;
  symbol?: string;
  ticker?: string;
  name?: string;
  cik?: string;
  canonical_id?: string;
  canonicalID?: string;
  listing_id?: string;
  listingID?: string;
  exchange?: string | null;
  mic?: string | null;
  country_code?: string | null;
  countryCode?: string | null;
  coverage_state?: CompanyCoverageState;
  coverageState?: CompanyCoverageState;
  detail_url?: string | null;
  detailURL?: string | null;
  source_system?: string | null;
  sourceSystem?: string | null;
}

export const getCompanySearchSymbol = (company: CompanySearchResult): string | null => {
  const symbol = company.symbol ?? company.ticker;
  return symbol?.trim() || null;
};

export const getCompanySearchId = (
  company: CompanySearchResult,
  fallbackSymbol: string,
): string => company.listing_id ?? company.listingID ?? company._id ?? company.id ?? `search:${fallbackSymbol}`;

export const getCompanyCoverageState = (
  company: CompanySearchResult,
): CompanyCoverageState => company.coverage_state ?? company.coverageState ?? 'valuation_ready';

export const getCompanyListingLabel = (company: CompanySearchResult): string | null =>
  company.listing_id ?? company.listingID ?? company.mic ?? company.exchange ?? null;

export const getCompanyMarketLabel = (company: CompanySearchResult): string | null =>
  company.exchange ?? company.mic ?? company.country_code ?? company.countryCode ?? null;

export const formatCoverageState = (state: CompanyCoverageState): string => {
  if (state === 'valuation_ready') {
    return 'Valuation ready';
  }
  if (state === 'search_only') {
    return 'Search only';
  }
  return 'Detail only';
};
