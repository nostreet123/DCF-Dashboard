export type CoverageState = 'valuation_ready' | 'import_required' | 'detail_only';

export type SourceLink = {
  title: string;
  url: string;
};

export type CompanySearchResult = {
  id: string;
  symbol: string;
  name: string;
  exchangeMic?: string | null;
  market?: string | null;
  country?: string | null;
  currency?: string | null;
  coverageState: CoverageState;
  coverageReason?: string | null;
  logoUrl?: string | null;
  sourceLinks: SourceLink[];
};

export type ImportedArtifactKind =
  | 'incomeStatement'
  | 'balanceSheet'
  | 'cashFlow'
  | 'sharesMeta';

export type ParsedFieldName =
  | 'periodEnd'
  | 'filingDate'
  | 'filingCurrency'
  | 'revenue'
  | 'cash'
  | 'debt'
  | 'sharesOutstanding';

export type ImportConfidence = 'high' | 'medium' | 'low';

export type ParsedFieldCandidate = {
  field: ParsedFieldName;
  rawValue: string;
  numericValue?: number | null;
  periodEnd?: string | null;
  artifactId: string;
  artifactFilename: string;
  confidence: ImportConfidence;
  reviewRequired: boolean;
};

export type ImportedArtifactMetadata = {
  id: string;
  kind: ImportedArtifactKind;
  originalFilename: string;
  parserName: string;
  fileFormat: string;
  storageId?: string | null;
  requiresReview: boolean;
  candidates: ParsedFieldCandidate[];
  notes: string[];
};

export type ImportReviewField = {
  field: ParsedFieldName;
  value: string;
  sourceFilename?: string | null;
  confidence?: ImportConfidence | null;
  isManualOverride: boolean;
  confirmed?: boolean;
};

export type ImportReview = {
  chosenPeriodEnd?: string | null;
  fields: ImportReviewField[];
  missingRequiredFields: ParsedFieldName[];
  notes: string[];
  isValuationReady: boolean;
};

export type ImportedFacts = {
  listingId: string;
  approvedAt: string;
  company: CompanySearchResult;
  filingCurrency?: string | null;
  source: string;
  provenance: {
    sourceSystem: string;
    sourceLinks: SourceLink[];
    artifacts: ImportedArtifactMetadata[];
  };
  statements: Array<{
    periodEnd: string;
    periodType: 'FY';
    filingDate?: string | null;
    currency?: string | null;
    revenue: number;
    operatingIncome?: number | null;
    operatingMargin?: number | null;
    cash: number;
    debt: number;
    sharesOutstanding: number;
    source: string;
  }>;
};
