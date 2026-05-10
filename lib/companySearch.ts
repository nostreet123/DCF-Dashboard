import type {
  CompanySearchResult as ContractCompanySearchResult,
  CoverageState,
} from '@/lib/contracts/company';

export type CompanyCoverageState = CoverageState | 'search_only';

export type CompanySearchResult = ContractCompanySearchResult & {
  _id?: string;
  ticker?: string;
  cik?: string;
  canonical_id?: string;
  canonicalID?: string;
  listing_id?: string;
  listingID?: string;
  exchange?: string | null;
  mic?: string | null;
  exchangeMic?: string | null;
  market?: string | null;
  country?: string | null;
  currency?: string | null;
  coverageReason?: string | null;
  logoUrl?: string | null;
  sourceLinks?: Array<{ title: string; url: string }>;
  country_code?: string | null;
  countryCode?: string | null;
  coverage_state?: CompanyCoverageState;
  coverageState?: CompanyCoverageState;
  detail_url?: string | null;
  detailURL?: string | null;
  source_system?: string | null;
  sourceSystem?: string | null;
};

export const getCompanySearchSymbol = (company: CompanySearchResult): string | null => {
  const symbol = company.symbol ?? company.ticker;
  return symbol?.trim() || null;
};

export const getCompanySearchId = (
  company: CompanySearchResult,
  fallbackSymbol: string,
): string => company._id ?? company.id ?? company.listing_id ?? company.listingID ?? `search:${fallbackSymbol}`;


export const getCompanyCoverageState = (
  company: CompanySearchResult,
): CompanyCoverageState => company.coverage_state ?? company.coverageState ?? 'valuation_ready';

export const getBestValuationSearchResult = (
  results: CompanySearchResult[],
): CompanySearchResult | undefined =>
  results.find((company) => getCompanyCoverageState(company) === 'valuation_ready') ?? results[0];

export const getCompanyListingLabel = (company: CompanySearchResult): string | null =>
  company.listing_id ??
  company.listingID ??
  company.exchangeMic ??
  company.mic ??
  company.exchange ??
  null;

export const getCompanyMarketLabel = (company: CompanySearchResult): string | null =>
  company.market ??
  company.exchange ??
  company.exchangeMic ??
  company.mic ??
  company.country ??
  company.country_code ??
  company.countryCode ??
  null;

export const formatCoverageState = (state: CompanyCoverageState): string => {
  if (state === 'valuation_ready') {
    return 'Valuation ready';
  }
  if (state === 'import_required' || state === 'search_only') {
    return 'Import required';
  }
  return 'Detail only';
};
