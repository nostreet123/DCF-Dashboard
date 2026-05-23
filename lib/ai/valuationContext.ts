import type { Assumptions, Scenario } from '@/lib/workbench/scenarioProfiles';
import type { CoverageState, SourceLink } from '@/lib/contracts/company';
import type { CompanySearchResult } from '@/lib/contracts/company';
import type { DcfResult } from '@/lib/hooks/useDcfCompute';
import type { ValuationReplaySnapshot } from '@/lib/hooks/useValuationHistory';

export type AiTokenUsage = {
  inputTokens: number;
  estimated: boolean;
  inputBytes: number;
  systemTokens?: number;
  userTokens?: number;
  messageCount?: number;
  model?: string;
  tokenizer?: string;
};

const aiAnalysisProgressMessages = [
  'Packaging current valuation, projections, sensitivity, Monte Carlo, and provenance',
  'Checking approved imports, artifacts, and valuation history from Convex',
  'Sending the valuation context to the configured model',
  'Waiting for strict base, bull, and bear assumptions',
  'Validating bounds, ordering, and material assumption changes',
];

export const AI_ANALYSIS_PROGRESS_STEP_COUNT = aiAnalysisProgressMessages.length;

export const getAiAnalysisProgressMessages = (): readonly string[] => aiAnalysisProgressMessages;

type AiScenarioValue = number | null;

type AiStatementTrends = {
  latestPeriodEnd?: string | null;
  latestRevenueGrowthPct?: number | null;
  revenueCagrPct?: number | null;
  latestOperatingMarginPct?: number | null;
  averageOperatingMarginPct?: number | null;
  latestCashToRevenuePct?: number | null;
  latestDebtToRevenuePct?: number | null;
  latestNetDebtToRevenuePct?: number | null;
  periodsCovered: string[];
};

export type AiValuationContext = {
  task: 'dcf_scenario_assumptions';
  company: {
    id: string | null;
    symbol: string;
    name?: string | null;
    exchangeMic?: string | null;
    market?: string | null;
    country?: string | null;
    currency?: string | null;
    coverageState?: CoverageState;
    coverageReason?: string | null;
    sourceLinks: SourceLink[];
  };
  activeScenario: 'base' | 'bull' | 'bear';
  displayCurrency: string;
  currentAssumptions: Record<Scenario, Assumptions>;
  valuation: {
    activeFairValue: number | null;
    range?: [number, number];
    scenarios: Record<'base' | 'bull' | 'bear', AiScenarioValue>;
  } | null;
  financials: {
    kpis: DcfResult['kpis'];
    statementHistory: DcfResult['statementHistory'];
    statementTrends: AiStatementTrends;
    projections: DcfResult['projections'];
  };
  sensitivity?: {
    growthOffsets?: number[];
    waccOffsets?: number[];
    values?: number[][];
  };
  monteCarlo?: {
    summary?: DcfResult['monteCarloSummary'];
    histogram?: DcfResult['histogram'];
  };
  provenance?: DcfResult['provenance'];
  replay?: {
    runId: string;
    createdAt?: number;
  };
  convex?: {
    importedFacts?: unknown | null;
    importArtifacts?: unknown[];
    historyReadsEnabled: boolean;
  };
  instructions: {
    output: 'strict_base_bull_bear_json';
    useContext: string[];
    avoid: string[];
  };
};

export type ConvexImportContext = {
  importedFacts: unknown | null;
  artifacts: unknown[];
};

const finiteOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const rateToPercent = (value: number | null | undefined): number | null => {
  const finite = finiteOrNull(value);
  if (finite === null) {
    return null;
  }
  return Math.abs(finite) <= 1 ? finite * 100 : finite;
};

const roundPercent = (value: number | null): number | null =>
  value === null ? null : Math.round(value * 100) / 100;

const buildStatementTrends = (
  history: DcfResult['statementHistory'] | ValuationReplaySnapshot['statementHistory'] | undefined,
): AiStatementTrends => {
  const ordered = [...(history ?? [])].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
  const latest = ordered[0];
  const previous = ordered[1];
  const latestRevenueGrowthPct =
    latest?.revenue && previous?.revenue
      ? ((latest.revenue - previous.revenue) / previous.revenue) * 100
      : null;
  const oldest = ordered[ordered.length - 1];
  const latestYear = latest ? Number(latest.periodEnd.slice(0, 4)) : null;
  const oldestYear = oldest ? Number(oldest.periodEnd.slice(0, 4)) : null;
  const yearSpan =
    Number.isFinite(latestYear) && Number.isFinite(oldestYear)
      ? Number(latestYear) - Number(oldestYear)
      : 0;
  const revenueCagrPct =
    latest?.revenue && oldest?.revenue && yearSpan > 0
      ? (((latest.revenue / oldest.revenue) ** (1 / yearSpan)) - 1) * 100
      : null;
  const operatingMarginPct = (point: (typeof ordered)[number] | undefined): number | null => {
    if (!point) {
      return null;
    }
    const margin =
      rateToPercent(point.operatingMargin) ??
      (point.operatingIncome !== null &&
      point.operatingIncome !== undefined &&
      point.revenue
        ? (point.operatingIncome / point.revenue) * 100
        : null);
    return margin;
  };
  const operatingMargins = ordered.flatMap((point) => {
    const margin = operatingMarginPct(point);
    return margin === null ? [] : [margin];
  });

  return {
    latestPeriodEnd: latest?.periodEnd ?? null,
    latestRevenueGrowthPct: roundPercent(latestRevenueGrowthPct),
    revenueCagrPct: roundPercent(revenueCagrPct),
    latestOperatingMarginPct: roundPercent(operatingMarginPct(latest)),
    averageOperatingMarginPct: roundPercent(
      operatingMargins.length > 0
        ? operatingMargins.reduce((sum, value) => sum + value, 0) / operatingMargins.length
        : null,
    ),
    latestCashToRevenuePct: roundPercent(
      latest?.cash !== null && latest?.cash !== undefined && latest.revenue
        ? (latest.cash / latest.revenue) * 100
        : null,
    ),
    latestDebtToRevenuePct: roundPercent(
      latest?.debt !== null && latest?.debt !== undefined && latest.revenue
        ? (latest.debt / latest.revenue) * 100
        : null,
    ),
    latestNetDebtToRevenuePct: roundPercent(
      latest?.cash !== null &&
        latest?.cash !== undefined &&
        latest?.debt !== null &&
        latest?.debt !== undefined &&
        latest.revenue
        ? ((latest.debt - latest.cash) / latest.revenue) * 100
        : null,
    ),
    periodsCovered: ordered.map((point) => point.periodEnd),
  };
};

const readScenarioValueForAi = (
  scenarios: DcfResult['scenarios'] | ValuationReplaySnapshot['scenarios'] | undefined,
  scenarioName: 'base' | 'bull' | 'bear',
): AiScenarioValue => {
  const value = scenarios?.[scenarioName];
  if (typeof value === 'number' || value === null) {
    return finiteOrNull(value);
  }
  return finiteOrNull(value?.fairValue);
};

const mergeSourceLinks = (
  selectedCompany: CompanySearchResult | null,
  companyDetail: CompanySearchResult | null,
): SourceLink[] => {
  const links = [...(selectedCompany?.sourceLinks ?? []), ...(companyDetail?.sourceLinks ?? [])];
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = `${link.title}:${link.url}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export const buildAiValuationContext = ({
  activeCompanyId,
  activeTicker,
  companyDetail,
  displayCurrency,
  result,
  scenario,
  scenarioAssumptions,
  selectedSearchCompany,
  convexImportContext,
  historyReadsEnabled,
}: {
  activeCompanyId: string | null;
  activeTicker: string;
  companyDetail: CompanySearchResult | null;
  convexImportContext: ConvexImportContext | null;
  displayCurrency: string;
  historyReadsEnabled: boolean;
  result: DcfResult | ValuationReplaySnapshot | null;
  scenario: 'base' | 'bull' | 'bear';
  scenarioAssumptions: Record<Scenario, Assumptions>;
  selectedSearchCompany: CompanySearchResult | null;
}): AiValuationContext => {
  const company = companyDetail ?? selectedSearchCompany;
  const activeFairValue =
    'fairValue' in (result ?? {})
      ? finiteOrNull((result as DcfResult | null)?.fairValue)
      : readScenarioValueForAi(result?.scenarios, scenario);

  return {
    task: 'dcf_scenario_assumptions',
    company: {
      id: activeCompanyId,
      symbol: company?.symbol ?? activeTicker,
      name: company?.name ?? result?.provenance?.name,
      exchangeMic: company?.exchangeMic ?? null,
      market: company?.market ?? null,
      country: company?.country ?? null,
      currency: company?.currency ?? result?.provenance?.currency ?? displayCurrency,
      coverageState: company?.coverageState,
      coverageReason: company?.coverageReason ?? null,
      sourceLinks: mergeSourceLinks(selectedSearchCompany, companyDetail),
    },
    activeScenario: scenario,
    displayCurrency,
    currentAssumptions: scenarioAssumptions,
    valuation: result
      ? {
          activeFairValue,
          range: result.range,
          scenarios: {
            base: readScenarioValueForAi(result.scenarios, 'base'),
            bull: readScenarioValueForAi(result.scenarios, 'bull'),
            bear: readScenarioValueForAi(result.scenarios, 'bear'),
          },
        }
      : null,
    financials: {
      kpis: result?.kpis ?? [],
      statementHistory: result?.statementHistory ?? [],
      statementTrends: buildStatementTrends(result?.statementHistory),
      projections: result?.projections ?? [],
    },
    sensitivity: result
      ? {
          growthOffsets: result.sensitivity?.growthOffsets,
          waccOffsets: result.sensitivity?.waccOffsets,
          values: result.sensitivityMatrix,
        }
      : undefined,
    monteCarlo: result
      ? {
          summary: result.monteCarloSummary,
          histogram: result.histogram,
        }
      : undefined,
    provenance: result?.provenance,
    replay: result && 'runId' in result ? { runId: result.runId, createdAt: result.createdAt } : undefined,
    convex: {
      importedFacts: convexImportContext?.importedFacts ?? null,
      importArtifacts: convexImportContext?.artifacts ?? [],
      historyReadsEnabled,
    },
    instructions: {
      output: 'strict_base_bull_bear_json',
      useContext: [
        'company identity, market, country, currency, and official source links',
        'current base, bull, and bear assumptions only as dashboard state for no-op avoidance',
        'latest fair value, scenario values, valuation range, and display currency',
        'historical statement facts and KPI trends',
        'forecast projections and free cash flow path',
        'sensitivity offsets/matrix and Monte Carlo distribution summary',
        'filing provenance and latest reporting dates',
        'approved Convex imported facts and artifacts when present',
        'Convex valuation replay data when a saved run is selected',
      ],
      avoid: [
        'inventing facts not present in the context',
        'using market commentary that conflicts with filing provenance',
        'returning markdown, prose outside JSON, or chain-of-thought',
      ],
    },
  };
};
