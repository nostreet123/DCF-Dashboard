import type { Assumptions, Scenario } from '@/lib/workbench/scenarioProfiles';
import type {
  CompanySearchResult,
  CoverageState,
  ImportReview,
  ImportedArtifactMetadata,
} from '@/lib/contracts/company';
import type { DcfResult } from '@/lib/hooks/useDcfCompute';
import type { ValuationReplaySnapshot } from '@/lib/hooks/useValuationHistory';
import type { DatasetGroups, RailVariant } from '@/lib/hooks/useWorkbenchViewState';
import type { ValuationHistoryItem } from '@/lib/valuationHistory';
import type { AiTokenUsage } from '@/lib/ai/valuationContext';

export type CoverageFilter = CoverageState | 'all';

export type WorkspaceMode = 'valuation' | 'import' | 'detail';

export type ImportParseResult = {
  artifacts: ImportedArtifactMetadata[];
  review: ImportReview;
};

export type SettingsStatus = {
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

export type AiAnalysisStatus = 'idle' | 'loading' | 'applied' | 'error';

export type ImportStatus = 'idle' | 'parsing' | 'approving' | 'approved' | 'error';

export type DashboardCompanyViewModel = {
  activeCompanyId: string | null;
  activeTicker: string;
  companyDetail: CompanySearchResult | null;
  selectedSearchCompany: CompanySearchResult | null;
};

export type DashboardSearchViewModel = {
  feedback: string | null;
  results: CompanySearchResult[];
  isSearching: boolean;
  coverageFilter: CoverageFilter;
  setCoverageFilter: (filter: CoverageFilter) => void;
  handleSearch: (query: string) => Promise<void>;
  handleSearchPreview: (query: string) => Promise<void>;
  handleSelectSearchResult: (company: CompanySearchResult) => void;
};

export type DashboardWorkspaceViewModel = {
  mode: WorkspaceMode;
  scenario: Scenario;
  setScenario: (scenario: Scenario) => void;
  assumptions: Assumptions;
  handleAssumptionChange: (key: Extract<keyof Assumptions, string>, value: number) => void;
};

export type DashboardValuationViewModel = {
  currentValue: number | null;
  displayScenario: Scenario;
  displayCurrency: string;
  valuationRange: [number, number] | undefined;
  histogram: DcfResult['histogram'] | undefined;
  valueCardAssumptions: Assumptions;
  detailsForDisplay: DcfResult | ValuationReplaySnapshot | null;
  sensitivityMatrix: number[][] | undefined;
  isComputing: boolean;
  isReplayDisplay: boolean;
  isReplayLoading: boolean;
  error: Error | null;
  clearError: () => void;
};

export type DashboardHistoryViewModel = {
  runHistory: ValuationHistoryItem[];
  isRunHistoryLoading: boolean;
  runHistoryError: Error | null;
  selectedRunId: string | null;
  recentCompanies: CompanySearchResult[];
  handleSelectCompany: (id: string, source: RailVariant) => void;
  handleSelectRun: (id: string, source: RailVariant) => void;
};

export type DashboardImportViewModel = {
  parseResult: ImportParseResult | null;
  status: ImportStatus;
  error: string | null;
  handleImportParse: (files: File[]) => Promise<void>;
  handleApproveImport: (review: ImportReview) => Promise<void>;
};

export type DashboardAiViewModel = {
  status: AiAnalysisStatus;
  rationales: Partial<Record<Scenario, string>>;
  stream: string[];
  tokenUsage: AiTokenUsage | null;
  adminModeEnabled: boolean;
  handleApplyAiAnalysis: () => Promise<void>;
  handleAdminTokenChange: (token: string) => void;
};

export type DashboardSettingsViewModel = {
  status: SettingsStatus | null;
};

export type DashboardDrawersViewModel = {
  activeDrawer: 'library' | 'assumptions' | null;
  closeDrawers: () => void;
  openLibraryDrawer: () => void;
  openAssumptionsDrawer: () => void;
};

export type DashboardDemoViewModel = {
  isDemoMode: boolean;
  mockDatasets: DatasetGroups;
  mockPriceHistory: number[];
};

export type DashboardViewModel = {
  company: DashboardCompanyViewModel;
  search: DashboardSearchViewModel;
  workspace: DashboardWorkspaceViewModel;
  valuation: DashboardValuationViewModel;
  history: DashboardHistoryViewModel;
  import: DashboardImportViewModel;
  ai: DashboardAiViewModel;
  settings: DashboardSettingsViewModel;
  drawers: DashboardDrawersViewModel;
  demo: DashboardDemoViewModel;
};
