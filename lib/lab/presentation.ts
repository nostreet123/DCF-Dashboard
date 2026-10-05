import type { ValueBridge } from '@/lib/hooks/useDcfCompute';
import type { Assumptions, Scenario } from '@/lib/workbench/scenarioProfiles';
import { scenarioAssumptionDefaults } from '@/lib/workbench/scenarioProfiles';
import type { MockDatasetGroups } from '@/lib/workbench/mockData';
import { mockDatasets, mockDemoReplaySnapshot, mockRunHistory } from '@/lib/workbench/mockData';

export const LAB_PATHS = {
  memo: '/',
  library: '/library',
  history: '/history',
  workbench: '/workbench',
} as const;

export const DEMO_MARKET_PRICE = 152.35;

export type LabScreen = 'memo' | 'library' | 'history';

export type LabStatus = 'memo' | 'computing' | 'import' | 'unavailable';

export type AssumptionKind = 'growth' | 'margin' | 'discount' | 'terminal';

export type LibraryFilter = 'all' | 'ready' | 'import';

export interface LabCompany {
  id: string;
  ticker: string;
  name: string;
  sector: string;
  ready: boolean;
  lastValue: number | null;
  lastAt: Date | null;
}

export interface LabHistoryRun {
  id: string;
  ticker: string;
  name: string;
  shortName: string;
  value: number;
  at: Date;
  scenarioLabel: string;
  assumptions: Assumptions | null;
}

export interface BridgeRowModel {
  amount: number;
  negative: boolean;
  label: string;
  valueLabel: string;
  left: number;
  width: number;
  tone: 'explicit' | 'terminal' | 'cash' | 'debt' | 'equity';
  emphasis: boolean;
}

export interface SensitivityCell {
  text: string;
  role: 'corner' | 'header' | 'value';
  abovePrice: boolean;
  isBase: boolean;
}

export interface ValueMark {
  label: string;
  compactLabel: string;
  value: string;
  compactValue: string;
  left: number;
  placement: 'above' | 'below';
  emphasis: boolean;
}

const ASSUMPTION_FIELDS: Array<{
  kind: AssumptionKind;
  key: keyof Assumptions;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { kind: 'growth', key: 'revenueGrowth', label: 'Revenue growth', min: -5, max: 30, step: 0.5 },
  { kind: 'margin', key: 'operatingMargin', label: 'Operating margin', min: 5, max: 60, step: 0.5 },
  { kind: 'discount', key: 'discountRate', label: 'Discount rate', min: 5, max: 20, step: 0.25 },
  { kind: 'terminal', key: 'terminalGrowth', label: 'Terminal growth', min: 0, max: 5, step: 0.1 },
];

const IMPORT_CANDIDATES: LabCompany[] = [
  {
    id: 'import:NVDA',
    ticker: 'NVDA',
    name: 'NVIDIA Corp.',
    sector: 'Technology',
    ready: false,
    lastValue: null,
    lastAt: null,
  },
];

export function parseLabStatus(value: string | null | undefined): LabStatus {
  if (value === 'computing' || value === 'import' || value === 'unavailable') {
    return value;
  }
  return 'memo';
}

export function resolveLabPhase({
  queryStatus,
  workspaceMode,
  hasError,
  hasValue,
  importApproved = false,
}: {
  queryStatus: LabStatus;
  workspaceMode: string;
  hasError: boolean;
  hasValue: boolean;
  importApproved?: boolean;
}): LabStatus {
  if (queryStatus !== 'memo' && !(queryStatus === 'import' && importApproved)) {
    return queryStatus;
  }
  if (workspaceMode === 'import') {
    return 'import';
  }
  if (hasError) {
    return 'unavailable';
  }
  return hasValue ? 'memo' : 'computing';
}

export function isDemoMemoAvailable(ticker: string | null, runId: string | null): boolean {
  return (!ticker || ticker.trim().toUpperCase() === 'AAPL') && (!runId || runId === 'r1');
}

export function companyShortName(name: string): string {
  return name.replace(/\s+(Inc\.|Corp\.|Corporation|Incorporated|Ltd\.|Limited|Co\.)$/i, '').trim();
}

export function formatSharePrice(value: number, digits = 2, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatAssumptionPercent(value: number, kind: AssumptionKind): string {
  if (kind === 'discount' || kind === 'terminal') {
    return `${value.toFixed(2).replace(/0$/, '')}%`;
  }
  const text = value.toFixed(1);
  return `${text.endsWith('.0') ? text.slice(0, -2) : text}%`;
}

export function gapPhrase(fairValue: number, price: number): string {
  const gap = fairValue / price - 1;
  const magnitude = (Math.abs(gap) * 100).toFixed(1);
  return `${magnitude}% ${gap >= 0 ? 'above' : 'below'}`;
}

export function formatBillions(dollars: number): string {
  const scaled = dollars / 1_000_000_000;
  return scaled.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: Math.abs(scaled) >= 0.1 ? 1 : 9,
  });
}

export function formatStartingRevenue(dollars: number, currency = 'USD'): string {
  if (Math.abs(dollars) < 1_000_000) {
    return formatSharePrice(dollars, 1, currency);
  }
  const billions = dollars / 1_000_000_000;
  return `${new Intl.NumberFormat('en-US', {
    style: 'currency', currency, minimumFractionDigits: 0,
    maximumFractionDigits: Math.abs(billions) >= 0.1 ? 1 : 9,
  }).format(billions)}B`;
}

export function formatShareCount(shares: number): string {
  if (shares >= 1_000_000_000) {
    return `${(shares / 1_000_000_000).toLocaleString('en-US', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}B`;
  }
  if (shares >= 1_000_000) {
    return `${(shares / 1_000_000).toLocaleString('en-US', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}M`;
  }
  return shares.toLocaleString('en-US');
}

export function formatLabDay(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatLabTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
  }).format(date);
}

export function formatLabDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function assumptionsMatch(left: Assumptions, right: Assumptions): boolean {
  return (
    left.revenueGrowth === right.revenueGrowth &&
    left.operatingMargin === right.operatingMargin &&
    left.discountRate === right.discountRate &&
    left.terminalGrowth === right.terminalGrowth
  );
}

export function caseLabel(
  scenario: Scenario,
  assumptions: Assumptions,
  presets?: Partial<Record<Scenario, Assumptions>>,
): string {
  const preset = presets?.[scenario] ?? scenarioAssumptionDefaults[scenario];
  if (!assumptionsMatch(assumptions, preset)) {
    return 'Your case';
  }
  if (scenario === 'bear') {
    return 'Bear case';
  }
  if (scenario === 'bull') {
    return 'Bull case';
  }
  return 'Base case';
}

export function stepAssumption(
  assumptions: Assumptions,
  kind: AssumptionKind,
  direction: -1 | 1,
): Assumptions {
  const field = ASSUMPTION_FIELDS.find((item) => item.kind === kind);
  if (!field) {
    return assumptions;
  }
  const next = { ...assumptions };
  const raw = next[field.key] + direction * field.step;
  const clamped = Math.min(field.max, Math.max(field.min, Math.round(raw * 100) / 100));
  next[field.key] = clamped;
  if (next.discountRate <= next.terminalGrowth) {
    if (kind === 'discount') {
      next.discountRate = Math.min(field.max, Math.round((next.terminalGrowth + 0.25) * 100) / 100);
    } else if (kind === 'terminal') {
      next.terminalGrowth = Math.max(0, Math.round((next.discountRate - 0.25) * 100) / 100);
    }
  }
  return next;
}

export function assumptionFields(): typeof ASSUMPTION_FIELDS {
  return ASSUMPTION_FIELDS;
}

export function buildLibraryCatalog(
  datasets: MockDatasetGroups = mockDatasets,
  runs: Array<{ ticker: string; value: number; timestamp: Date }> = mockRunHistory,
): LabCompany[] {
  const latestByTicker = new Map<string, { value: number; timestamp: Date }>();
  for (const run of runs) {
    const current = latestByTicker.get(run.ticker);
    if (!current || run.timestamp.getTime() > current.timestamp.getTime()) {
      latestByTicker.set(run.ticker, { value: run.value, timestamp: run.timestamp });
    }
  }

  const ready = Object.entries(datasets).flatMap(([sector, items]) =>
    items.map((item) => {
      const last = latestByTicker.get(item.ticker);
      return {
        id: item.id,
        ticker: item.ticker,
        name: item.name,
        sector,
        ready: item.ticker === 'AAPL',
        lastValue: last?.value ?? null,
        lastAt: last?.timestamp ?? null,
      };
    }),
  );

  const known = new Set(ready.map((company) => company.ticker));
  return [...ready, ...IMPORT_CANDIDATES.filter((company) => !known.has(company.ticker))];
}

export function filterLibrary(
  companies: LabCompany[],
  query: string,
  filter: LibraryFilter,
): LabCompany[] {
  const normalized = query.trim().toLowerCase();
  return companies.filter((company) => {
    const matchesQuery =
      normalized.length === 0 ||
      company.ticker.toLowerCase().includes(normalized) ||
      company.name.toLowerCase().includes(normalized);
    const matchesFilter =
      filter === 'all' || (filter === 'ready' ? company.ready : !company.ready);
    return matchesQuery && matchesFilter;
  });
}

export function libraryAction(company: LabCompany): 'Open memo' | 'Write a memo' | 'Import from SEC' {
  if (!company.ready) {
    return 'Import from SEC';
  }
  return company.lastValue === null ? 'Write a memo' : 'Open memo';
}

export function formatLastMemo(company: LabCompany): string {
  if (company.lastValue === null || company.lastAt === null) {
    return '—';
  }
  return `${formatSharePrice(company.lastValue)} · ${formatLabDay(company.lastAt)}`;
}

export function buildDemoHistory(): LabHistoryRun[] {
  const catalog = buildLibraryCatalog();
  const byTicker = new Map(catalog.map((company) => [company.ticker, company]));
  return mockRunHistory.map((run) => {
    const company = byTicker.get(run.ticker);
    const name = company?.name ?? run.ticker;
    const assumptions =
      run.id === 'r1' ? mockDemoReplaySnapshot.assumptions.base : null;
    return {
      id: run.id,
      ticker: run.ticker,
      name,
      shortName: companyShortName(name),
      value: run.value,
      at: run.timestamp,
      scenarioLabel: assumptions ? 'Base case' : 'Result-only demo',
      assumptions,
    };
  });
}

export function findCatalogCompany(ticker: string, companies = buildLibraryCatalog()): LabCompany | null {
  const normalized = ticker.trim().toUpperCase();
  return companies.find((company) => company.ticker === normalized) ?? null;
}

export interface BridgeForecast {
  cashFlows: Array<number | null>;
  discountRate: number;
  terminalGrowth: number;
}

export function bridgeFromStatements(
  fairValue: number,
  statement: { cash?: number | null; debt?: number | null; sharesOutstanding?: number | null } | null,
  engineBridge?: ValueBridge,
  forecast?: BridgeForecast,
): ValueBridge {
  const shares = engineBridge?.sharesOutstanding ?? statement?.sharesOutstanding ?? null;
  const equity =
    engineBridge?.equity ?? (shares !== null && Number.isFinite(fairValue) ? fairValue * shares : null);
  const cash = engineBridge?.cash ?? statement?.cash ?? null;
  const debt = engineBridge?.debt ?? statement?.debt ?? null;
  const operating =
    equity !== null && cash !== null && debt !== null ? equity - cash + debt : null;
  const filled = fillPresentValues(
    engineBridge?.pvExplicit ?? null,
    engineBridge?.pvTerminal ?? null,
    operating,
    forecast,
  );
  return {
    pvExplicit: filled.pvExplicit,
    pvTerminal: filled.pvTerminal,
    cash,
    debt,
    equity,
    sharesOutstanding: shares,
  };
}

function fillPresentValues(
  pvExplicit: number | null,
  pvTerminal: number | null,
  operating: number | null,
  forecast: BridgeForecast | undefined,
): { pvExplicit: number | null; pvTerminal: number | null } {
  if (pvExplicit !== null && pvTerminal !== null) {
    return { pvExplicit, pvTerminal };
  }
  if (operating === null) {
    return { pvExplicit, pvTerminal };
  }
  if (pvExplicit !== null) {
    return { pvExplicit, pvTerminal: operating - pvExplicit };
  }
  if (pvTerminal !== null) {
    return { pvExplicit: operating - pvTerminal, pvTerminal };
  }
  const split = discountForecast(forecast);
  const raw = split.explicit + split.terminal;
  if (raw <= 0 || !Number.isFinite(raw)) {
    return { pvExplicit: null, pvTerminal: null };
  }
  const scale = operating / raw;
  return { pvExplicit: split.explicit * scale, pvTerminal: split.terminal * scale };
}

function discountForecast(forecast: BridgeForecast | undefined): { explicit: number; terminal: number } {
  if (!forecast || forecast.cashFlows.length === 0) {
    return { explicit: 0, terminal: 0 };
  }
  const discount = forecast.discountRate / 100;
  const growth = forecast.terminalGrowth / 100;
  if (!(discount > growth)) {
    return { explicit: 0, terminal: 0 };
  }
  let explicit = 0;
  let last = 0;
  forecast.cashFlows.forEach((cashFlow, index) => {
    const amount = cashFlow ?? 0;
    last = amount;
    explicit += amount / (1 + discount) ** (index + 1);
  });
  const years = forecast.cashFlows.length;
  const terminal = (last * (1 + growth)) / (discount - growth) / (1 + discount) ** years;
  return { explicit, terminal };
}

export function buildBridgeRows(bridge: ValueBridge, forecastYears?: number): BridgeRowModel[] {
  const rows: Array<{
    label: string;
    amount: number | null;
    tone: BridgeRowModel['tone'];
    emphasis: boolean;
    signed: 'none' | 'plus' | 'minus';
  }> = [
    { label: forecastYears ? `PV of ${forecastYears}-year cash flow` : 'PV of explicit cash flow', amount: bridge.pvExplicit, tone: 'explicit', emphasis: false, signed: 'none' },
    { label: 'PV of terminal value', amount: bridge.pvTerminal, tone: 'terminal', emphasis: false, signed: 'plus' },
    { label: 'Plus cash', amount: bridge.cash, tone: 'cash', emphasis: false, signed: 'plus' },
    { label: 'Less debt', amount: bridge.debt, tone: 'debt', emphasis: false, signed: 'minus' },
    { label: 'Equity value', amount: bridge.equity, tone: 'equity', emphasis: true, signed: 'none' },
  ];
  const visible = rows.filter((row) => row.amount !== null && Number.isFinite(row.amount));
  let cursor = 0;
  const segments = visible.map((row) => {
    const amount = row.signed === 'minus' ? -(row.amount ?? 0) : row.amount ?? 0;
    const start = row.emphasis ? 0 : cursor;
    const end = row.emphasis ? amount : cursor + amount;
    if (!row.emphasis) cursor = end;
    return { row, amount, start, end };
  });
  const minimum = Math.min(0, ...segments.flatMap(({ start, end }) => [start, end]));
  const maximum = Math.max(0, ...segments.flatMap(({ start, end }) => [start, end]));
  const scale = maximum - minimum || 1;
  return segments.map(({ row, amount, start, end }) => {
    const width = Math.abs(end - start) / scale * 100;
    const left = (Math.min(start, end) - minimum) / scale * 100;
    const valueLabel =
      amount < 0 ? `−${formatBillions(Math.abs(amount))}`
        : row.signed !== 'none' && amount > 0 ? `+${formatBillions(amount)}`
          : formatBillions(amount);
    return {
      amount,
      negative: amount < 0,
      label: row.label,
      valueLabel,
      left,
      width,
      tone: row.tone,
      emphasis: row.emphasis,
    };
  });
}

export function buildValueMarks(input: {
  bear: number;
  bull: number;
  memo: number;
  price: number | null;
  compact?: boolean;
  currency?: string;
}): { marks: ValueMark[]; bandLeft: number; bandWidth: number; alt: string } {
  const values = [input.bear, input.bull, input.memo, input.price].filter(
    (value): value is number => value !== null,
  );
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const padding = maximum > minimum ? (maximum - minimum) * 0.25 : Math.max(Math.abs(minimum), 1) * 0.15;
  const lo = minimum - padding;
  const hi = maximum + padding;
  const span = hi - lo || 1;
  const pos = (value: number) => ((value - lo) / span) * 100;
  const marks: ValueMark[] = [
    {
      label: 'Bear',
      compactLabel: 'Bear',
      value: formatSharePrice(input.bear, 0, input.currency),
      compactValue: formatSharePrice(input.bear, 0, input.currency),
      left: pos(input.bear),
      placement: 'above',
      emphasis: false,
    },
    {
      label: 'Bull',
      compactLabel: 'Bull',
      value: formatSharePrice(input.bull, 0, input.currency),
      compactValue: formatSharePrice(input.bull, 0, input.currency),
      left: pos(input.bull),
      placement: 'above',
      emphasis: false,
    },
  ];
  if (input.price !== null) {
    marks.push({
      label: 'Price',
      compactLabel: 'Price',
      value: formatSharePrice(input.price, 2, input.currency),
      compactValue: formatSharePrice(input.price, 0, input.currency),
      left: pos(input.price),
      placement: 'above',
      emphasis: false,
    });
  }
  marks.push({
    label: 'This memo',
    compactLabel: 'Memo',
    value: formatSharePrice(input.memo, 2, input.currency),
    compactValue: formatSharePrice(input.memo, 0, input.currency),
    left: pos(input.memo),
    placement: 'below',
    emphasis: true,
  });
  const altParts = [
    `Bear ${formatSharePrice(input.bear, 2, input.currency)}`,
    `this memo ${formatSharePrice(input.memo, 2, input.currency)}`,
    `bull ${formatSharePrice(input.bull, 2, input.currency)}`,
  ];
  if (input.price !== null) {
    altParts.push(`price ${formatSharePrice(input.price, 2, input.currency)}`);
  }
  return {
    marks,
    bandLeft: pos(Math.min(input.bear, input.bull)),
    bandWidth: Math.abs(pos(input.bull) - pos(input.bear)),
    alt: altParts.join(', '),
  };
}

function nearestIndex(offsets: number[], target: number): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  offsets.forEach((offset, index) => {
    const distance = Math.abs(offset - target);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

export function buildSensitivityGrid(input: {
  matrix: number[][];
  growthOffsets: number[];
  waccOffsets: number[];
  baseGrowth: number;
  baseDiscount: number;
  price: number | null;
  compact: boolean;
  currency?: string;
}): { cells: SensitivityCell[]; columns: number } {
  const growthTargets = [-2, -1, 0, 1, 2];
  const waccTargets = [-1, -0.5, 0, 0.5, 1];
  const growthIndexes = growthTargets
    .map((target) => nearestIndex(input.growthOffsets, target))
    .filter((index, position, all) => all.indexOf(index) === position && input.growthOffsets[index] !== undefined);
  const waccIndexes = waccTargets
    .map((target) => nearestIndex(input.waccOffsets, target))
    .filter((index, position, all) => all.indexOf(index) === position && input.waccOffsets[index] !== undefined);

  const header = (text: string): SensitivityCell => ({
    text,
    role: 'header',
    abovePrice: false,
    isBase: false,
  });
  const cells: SensitivityCell[] = [{ text: '', role: 'corner', abovePrice: false, isBase: false }];
  for (const index of growthIndexes) {
    const rate = input.baseGrowth + (input.growthOffsets[index] ?? 0);
    cells.push(header(input.compact ? rate.toFixed(1) : `${rate.toFixed(1)}%`));
  }
  const columns = growthIndexes.length + 1;
  for (const waccIndex of waccIndexes) {
    const wacc = input.baseDiscount + (input.waccOffsets[waccIndex] ?? 0);
    const waccLabel = input.compact
      ? wacc.toFixed(2).replace(/0$/, '')
      : `${wacc.toFixed(2).replace(/0$/, '')}%`;
    cells.push(header(waccLabel));
    for (const growthIndex of growthIndexes) {
      const value = input.matrix[waccIndex]?.[growthIndex];
      const isBase = (input.growthOffsets[growthIndex] ?? 1) === 0 && (input.waccOffsets[waccIndex] ?? 1) === 0;
      const abovePrice = typeof value === 'number' && input.price !== null && value >= input.price;
      cells.push({
        text: typeof value === 'number' ? (input.compact ? value.toFixed(0) : formatSharePrice(value, 0, input.currency)) : '—',
        role: 'value',
        abovePrice,
        isBase,
      });
    }
  }
  return { cells, columns };
}

export function demoSensitivityOffsets(): { growth: number[]; wacc: number[] } {
  return {
    growth: [...mockDemoReplaySnapshot.sensitivity.growthOffsets],
    wacc: [...mockDemoReplaySnapshot.sensitivity.waccOffsets],
  };
}

export function projectionYearLabel(year: number, compact: boolean): string {
  return compact ? `'${String(year).slice(2)}` : String(year);
}

export function memoHeadline(shortName: string, fairValue: number, price: number | null): string {
  const worth = `${shortName} looks worth ${formatSharePrice(fairValue)} a share`;
  if (price === null) {
    return `${worth}.`;
  }
  return `${worth}, ${gapPhrase(fairValue, price)} where it trades today.`;
}

export const LAB_DISCLAIMER = 'For financial modeling and education only; not investment advice.';

export function demoDisclaimer(prefix: string): string {
  return `${prefix} ${LAB_DISCLAIMER}`;
}
