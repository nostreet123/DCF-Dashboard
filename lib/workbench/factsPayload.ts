import type { Assumptions, Scenario } from '@/lib/workbench/scenarioProfiles';

export type StatementFact = {
  period_end?: string | null;
  periodEnd?: string | null;
  period_type?: string | null;
  periodType?: string | null;
  filing_date?: string | null;
  filingDate?: string | null;
  currency?: string | null;
  revenue?: number | null;
  operating_income?: number | null;
  operatingIncome?: number | null;
  operating_margin?: number | null;
  operatingMargin?: number | null;
  cash?: number | null;
  debt?: number | null;
  shares_outstanding?: number | null;
  sharesOutstanding?: number | null;
  source?: string | null;
};

export type CompanyFactsPayload = {
  symbol: string;
  name?: string | null;
  cik?: string | null;
  currency?: string | null;
  filingCurrency?: string | null;
  source?: string | null;
  sourceSystem?: string | null;
  sourceLinks?: Array<{ title: string; url: string }>;
  statements?: StatementFact[] | null;
};

export type WorkbenchInputs = {
  symbol: string;
  scenario: Scenario;
  assumptions: Record<Scenario, Assumptions>;
};

const MODEL_DEFAULTS = {
  periods: 10,
  taxRate: 0.25,
  salesToCapital: 2,
} as const;

const readFiniteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const toRate = (percentage: number): number => percentage / 100;

const toScenarioPayload = (assumptions: Assumptions) => ({
  revenueGrowth: toRate(assumptions.revenueGrowth),
  ebitMargin: toRate(assumptions.operatingMargin),
  taxRate: MODEL_DEFAULTS.taxRate,
  salesToCapital: MODEL_DEFAULTS.salesToCapital,
  wacc: toRate(assumptions.discountRate),
  gStable: toRate(assumptions.terminalGrowth),
  waccStable: toRate(assumptions.discountRate),
});

const periodEndOf = (statement: StatementFact): string | null =>
  statement.period_end ?? statement.periodEnd ?? null;

const isAnnualStatement = (statement: StatementFact): boolean =>
  (statement.period_type ?? statement.periodType ?? 'FY') === 'FY';

const sortedAnnualStatements = (facts: CompanyFactsPayload): StatementFact[] =>
  (facts.statements ?? [])
    .filter(isAnnualStatement)
    .sort((a, b) => String(periodEndOf(b) ?? '').localeCompare(String(periodEndOf(a) ?? '')));

const latestAnnualStatement = (facts: CompanyFactsPayload): StatementFact => {
  const annual = sortedAnnualStatements(facts);
  const latest = annual[0];
  if (!latest) {
    throw new Error(`${facts.symbol} facts do not include annual statements`);
  }
  const missingRequiredFields = (['revenue', 'sharesOutstanding'] as const).filter((key) => {
    const raw =
      key === 'sharesOutstanding'
        ? latest.shares_outstanding ?? latest.sharesOutstanding
        : latest[key];
    return readFiniteNumber(raw) === null;
  });
  if (missingRequiredFields.length > 0) {
    throw new Error(
      `${facts.symbol} latest annual statement is missing ${missingRequiredFields.join(', ')}`,
    );
  }
  return latest;
};

const requireStatementNumber = (
  statement: StatementFact,
  key: 'revenue' | 'cash' | 'debt' | 'sharesOutstanding',
  symbol: string,
): number => {
  const raw =
    key === 'sharesOutstanding'
      ? statement.shares_outstanding ?? statement.sharesOutstanding
      : statement[key];
  const value = readFiniteNumber(raw);
  if (value === null) {
    throw new Error(`${symbol} facts are missing ${key}`);
  }
  return value;
};

const optionalBalanceNumber = (
  statement: StatementFact,
  key: 'cash' | 'debt',
): number => readFiniteNumber(statement[key]) ?? 0;

const getBaseYear = (statement: StatementFact, symbol: string): number => {
  const rawPeriodEnd = periodEndOf(statement);
  if (!rawPeriodEnd) {
    throw new Error(`${symbol} facts are missing period end`);
  }
  const year = Number(rawPeriodEnd.slice(0, 4));
  if (!Number.isInteger(year)) {
    throw new Error(`${symbol} facts include an invalid period end`);
  }
  return year;
};

const optionalStatementNumber = (value: unknown): number | undefined =>
  readFiniteNumber(value) ?? undefined;

const operatingIncomeOf = (statement: StatementFact): number | undefined =>
  optionalStatementNumber(statement.operating_income ?? statement.operatingIncome);

const operatingMarginOf = (statement: StatementFact): number | undefined =>
  optionalStatementNumber(statement.operating_margin ?? statement.operatingMargin);

export const buildWorkbenchPayloadFromFacts = (
  inputs: WorkbenchInputs,
  facts: CompanyFactsPayload,
) => {
  const latest = latestAnnualStatement(facts);
  return {
    symbol: facts.symbol,
    scenario: inputs.scenario,
    primaryKeyNorm: facts.symbol.toLowerCase(),
    baseYear: getBaseYear(latest, facts.symbol),
    periods: MODEL_DEFAULTS.periods,
    currency: facts.filingCurrency ?? facts.currency ?? latest.currency ?? 'USD',
    revenueT0: requireStatementNumber(latest, 'revenue', facts.symbol),
    cash: optionalBalanceNumber(latest, 'cash'),
    debt: optionalBalanceNumber(latest, 'debt'),
    sharesOutstanding: requireStatementNumber(latest, 'sharesOutstanding', facts.symbol),
    base: toScenarioPayload(inputs.assumptions.base),
    bull: toScenarioPayload(inputs.assumptions.bull),
    bear: toScenarioPayload(inputs.assumptions.bear),
    statements: sortedAnnualStatements(facts).map((statement) => ({
      periodEnd: periodEndOf(statement),
      revenue: optionalStatementNumber(statement.revenue),
      operatingIncome: operatingIncomeOf(statement),
      operatingMargin: operatingMarginOf(statement),
      cash: optionalStatementNumber(statement.cash),
      debt: optionalStatementNumber(statement.debt),
      sharesOutstanding: optionalStatementNumber(
        statement.shares_outstanding ?? statement.sharesOutstanding,
      ),
    })),
  };
};

export const getLatestAnnualStatement = latestAnnualStatement;
