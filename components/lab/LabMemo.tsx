'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { ImportWorkspace } from '@/components/workspace/ParityPanels';
import { WorkbenchProvider, useWorkbench } from '@/lib/contexts/WorkbenchContext';
import { getDashboardDataMode } from '@/lib/dashboardDataMode';
import { useDashboardController } from '@/lib/hooks/useDashboardController';
import {
  useDcfCompute,
  type DcfResult,
  type ProjectionRow,
  type StatementHistoryPoint,
} from '@/lib/hooks/useDcfCompute';
import type { ValuationReplaySnapshot } from '@/lib/valuationHistory';
import {
  assumptionFields,
  bridgeFromStatements,
  buildBridgeRows,
  buildDemoHistory,
  buildSensitivityGrid,
  buildValueMarks,
  caseLabel,
  companyShortName,
  demoDisclaimer,
  demoSensitivityOffsets,
  DEMO_MARKET_PRICE,
  findCatalogCompany,
  formatAssumptionPercent,
  formatBillions,
  formatLabDay,
  formatShareCount,
  formatSharePrice,
  formatStartingRevenue,
  gapPhrase,
  LAB_DISCLAIMER,
  LAB_PATHS,
  parseLabStatus,
  projectionYearLabel,
  resolveLabPhase,
  stepAssumption,
  type AssumptionKind,
  type LabStatus,
} from '@/lib/lab/presentation';
import {
  scenarioAssumptionDefaults,
  type Assumptions,
  type Scenario,
} from '@/lib/workbench/scenarioProfiles';
import { scenarioValues } from '@/lib/workbench/mockData';
import type { CompanySearchResult } from '@/lib/contracts/company';
import { cn } from '@/lib/utils/cn';
import { LabFrame } from './LabFrame';
import { ComputingMemo, ImportMemo, UnavailableMemo } from './LabStates';
import styles from './memo.module.css';

const SCENARIOS: Scenario[] = ['bear', 'base', 'bull'];
const SCENARIO_LABELS: Record<Scenario, string> = { bear: 'Bear', base: 'Base', bull: 'Bull' };

function isComputeResult(value: DcfResult | ValuationReplaySnapshot): value is DcfResult {
  return 'fairValue' in value;
}

function useCompactLayout(): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 860px)');
    const apply = () => setCompact(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);
  return compact;
}

function LabMemoBody() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const compact = useCompactLayout();
  const isDemo = getDashboardDataMode() === 'demo';
  const workbench = useWorkbench();
  const dashboard = useDashboardController();
  const { compute } = useDcfCompute({ debounceMs: 0 });
  const [engineResult, setEngineResult] = useState<DcfResult | null>(null);
  const [enginePhase, setEnginePhase] = useState<LabStatus>('memo');
  const [reviewing, setReviewing] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const appliedRoute = useRef<string | null>(null);
  const scenarioAssumptionsRef = useRef(workbench.assumptions);
  scenarioAssumptionsRef.current = workbench.assumptions;
  const computeRef = useRef(compute);
  computeRef.current = compute;
  const workbenchRef = useRef(workbench);
  workbenchRef.current = workbench;

  const queryStatus = parseLabStatus(searchParams.get('status'));
  const requestedTicker = searchParams.get('ticker');
  const requestedRun = searchParams.get('run');
  const rerun = searchParams.get('rerun');
  const requestedName = searchParams.get('name');

  const { selectCompany, setScenario, setScenarioAssumptions, setSelectedRunId } = workbench;

  useLayoutEffect(() => {
    if (!isDemo || queryStatus !== 'memo') {
      return;
    }
    const key = `${requestedRun ?? ''}|${requestedTicker ?? ''}`;
    if (appliedRoute.current === key) {
      return;
    }
    appliedRoute.current = key;
    const saved = requestedRun
      ? buildDemoHistory().find((run) => run.id === requestedRun)
      : requestedTicker
        ? undefined
        : buildDemoHistory()[0];
    if (saved) {
      const company = findCatalogCompany(saved.ticker);
      if (company?.ready) {
        selectCompany(company.id, company.ticker);
      }
      if (saved.assumptions) {
        setScenario('base');
        setScenarioAssumptions({
          ...scenarioAssumptionsRef.current,
          base: saved.assumptions,
        });
      }
      setSelectedRunId(saved.id);
      return;
    }
    if (requestedTicker) {
      const company = findCatalogCompany(requestedTicker);
      if (company?.ready) {
        selectCompany(company.id, company.ticker);
        setSelectedRunId(null);
      }
    }
  }, [
    isDemo,
    queryStatus,
    requestedRun,
    requestedTicker,
    selectCompany,
    setScenario,
    setScenarioAssumptions,
    setSelectedRunId,
  ]);

  const runValuation = useCallback((
    symbol: string,
    listingId: string | null,
    assumptions = workbenchRef.current.assumptions,
  ) => {
    const current = workbenchRef.current;
    void computeRef
      .current({
        symbol,
        listingId,
        scenario: current.scenario,
        assumptions,
      })
      .then((result) => {
        setEngineResult(result);
        setEnginePhase('memo');
        current.setSelectedRunId(null);
      })
      .catch((error: unknown) => {
        if (
          error instanceof Error &&
          (error.name === 'AbortError' || error.message === 'Superseded' || error.message === 'Reset')
        ) {
          return;
        }
        setEnginePhase('unavailable');
      });
  }, []);

  useEffect(() => {
    if (rerun !== '1' || queryStatus !== 'memo') {
      return;
    }
    const symbol = requestedTicker ?? workbenchRef.current.selectedSymbol ?? 'AAPL';
    runValuation(symbol, workbenchRef.current.selectedCompanyId);
  }, [queryStatus, requestedTicker, rerun, retryNonce, runValuation]);

  const catalogCompany = findCatalogCompany(dashboard.company.activeTicker);
  const companyName = catalogCompany?.name ?? dashboard.company.activeTicker;
  const shortName = companyShortName(companyName);
  const importTicker = (requestedTicker ?? 'NVDA').toUpperCase();
  const importCompany = findCatalogCompany(importTicker);
  const importName = importCompany?.name ?? requestedName ?? importTicker;

  const details = engineResult ?? dashboard.valuation.detailsForDisplay;
  const scenarioMap = readScenarioValues(details, isDemo);
  const assumptions = dashboard.workspace.assumptions;
  const savedRun = isDemo
    ? buildDemoHistory().find((run) => run.id === workbench.selectedRunId) ?? null
    : null;
  const scenario = dashboard.workspace.scenario;
  const fairValue =
    engineResult?.fairValue ??
    (savedRun && savedRun.ticker !== 'AAPL' ? savedRun.value : null) ??
    (isDemo ? scenarioMap[scenario] : dashboard.valuation.currentValue);
  const price = isDemo ? DEMO_MARKET_PRICE : null;
  const projections = readProjections(details);
  const statement = readStatement(details);
  const bridge = buildBridgeRows(
    bridgeFromStatements(fairValue ?? 0, statement, engineResult?.valueBridge ?? readBridge(details), {
      cashFlows: projections.map((row) => row.freeCashFlow),
      discountRate: assumptions.discountRate,
      terminalGrowth: assumptions.terminalGrowth,
    }),
  );
  const sensitivitySource = engineResult?.sensitivityMatrix ?? dashboard.valuation.sensitivityMatrix ?? [];
  const offsets = !engineResult && isDemo ? demoSensitivityOffsets() : readOffsets(details);
  const sensitivity = buildSensitivityGrid({
    matrix: sensitivitySource,
    growthOffsets: offsets.growth,
    waccOffsets: offsets.wacc,
    baseGrowth: assumptions.revenueGrowth,
    baseDiscount: assumptions.discountRate,
    price,
    compact,
  });
  const field = buildValueMarks({
    bear: scenarioMap.bear,
    bull: scenarioMap.bull,
    memo: fairValue ?? scenarioMap.base,
    price,
  });

  const phase = resolveLabPhase({
    queryStatus,
    workspaceMode: dashboard.workspace.mode,
    hasError:
      enginePhase === 'unavailable' ||
      (!isDemo && Boolean(dashboard.valuation.error) && !dashboard.valuation.isReplayDisplay),
    hasValue: fairValue !== null,
  });

  const retry = () => {
    const params = new URLSearchParams({
      rerun: '1',
      ticker: dashboard.company.activeTicker,
    });
    router.replace(`${LAB_PATHS.memo}?${params.toString()}`);
    setRetryNonce((value) => value + 1);
  };

  const changeAssumption = (kind: AssumptionKind, direction: -1 | 1) => {
    const next = stepAssumption(assumptions, kind, direction);
    const fieldForKind = assumptionFields().find((item) => item.kind === kind);
    if (!fieldForKind) {
      return;
    }
    const scenarioNow = workbenchRef.current.scenario;
    const nextAssumptions = {
      ...workbenchRef.current.assumptions,
      [scenarioNow]: next,
    };
    dashboard.workspace.handleAssumptionChange(fieldForKind.key, next[fieldForKind.key]);
    if (kind === 'discount' && next.terminalGrowth !== assumptions.terminalGrowth) {
      dashboard.workspace.handleAssumptionChange('terminalGrowth', next.terminalGrowth);
    }
    if (kind === 'terminal' && next.discountRate !== assumptions.discountRate) {
      dashboard.workspace.handleAssumptionChange('discountRate', next.discountRate);
    }
    if (!isDemo && queryStatus === 'memo') {
      runValuation(dashboard.company.activeTicker, workbenchRef.current.selectedCompanyId, nextAssumptions);
    }
  };

  const activeLabel = caseLabel(
    scenario,
    assumptions,
    savedRun?.assumptions ? { base: savedRun.assumptions } : undefined,
  );

  const pickScenario = (nextScenario: Scenario) => {
    if (nextScenario === scenario && activeLabel !== 'Your case') {
      return;
    }
    setEngineResult(null);
    setSelectedRunId(null);
    setScenario(nextScenario);
    setScenarioAssumptions({
      ...scenarioAssumptionsRef.current,
      [nextScenario]: { ...scenarioAssumptionDefaults[nextScenario] },
    });
  };

  const saved = isDemo ? buildDemoHistory()[0] : undefined;
  const savedLabel = saved
    ? `open the last saved ${saved.shortName} memo from ${formatLabDay(saved.at)}`
    : 'open the last saved memo';

  const importTarget: CompanySearchResult = {
    id: importCompany?.id ?? `import:${importTicker}`,
    symbol: importTicker,
    name: importName,
    coverageState: 'import_required',
    sourceLinks: [],
  };

  return (
    <LabFrame active="memo" showCompanySearch={phase === 'memo'} tone={phase === 'memo' ? 'paper' : 'status'}>
      {phase === 'computing' ? (
        <ComputingMemo companyLabel={`${dashboard.company.activeTicker} · ${companyName}`} shortName={shortName} />
      ) : null}
      {phase === 'import' ? (
        <ImportMemo
          ticker={importTicker}
          name={importName}
          reviewing={reviewing}
          onImport={() => {
            dashboard.search.handleSelectSearchResult(importTarget);
            setReviewing(true);
          }}
          review={
            <ImportWorkspace
              company={importTarget}
              parseResult={dashboard.import.parseResult}
              status={dashboard.import.status}
              error={dashboard.import.error}
              onParse={dashboard.import.handleImportParse}
              onApprove={dashboard.import.handleApproveImport}
            />
          }
        />
      ) : null}
      {phase === 'unavailable' ? <UnavailableMemo savedLabel={savedLabel} onRetry={retry} /> : null}
      {phase === 'memo' && fairValue !== null ? (
        <MemoDocument
          ticker={dashboard.company.activeTicker}
          name={companyName}
          shortName={shortName}
          label={activeLabel}
          fairValue={fairValue}
          price={price}
          assumptions={assumptions}
          scenario={scenario}
          scenarioMap={scenarioMap}
          field={field}
          bridge={bridge}
          shares={statement?.sharesOutstanding ?? null}
          sensitivity={sensitivity}
          compact={compact}
          projections={projections}
          startingRevenue={statement?.revenue ?? null}
          disclaimer={isDemo ? demoDisclaimer('Illustrative demo data.') : LAB_DISCLAIMER}
          onStep={changeAssumption}
          onScenario={pickScenario}
        />
      ) : null}
    </LabFrame>
  );
}

function MemoDocument({
  ticker,
  name,
  shortName,
  label,
  fairValue,
  price,
  assumptions,
  scenario,
  scenarioMap,
  field,
  bridge,
  shares,
  sensitivity,
  compact,
  projections,
  startingRevenue,
  disclaimer,
  onStep,
  onScenario,
}: {
  ticker: string;
  name: string;
  shortName: string;
  label: string;
  fairValue: number;
  price: number | null;
  assumptions: Assumptions;
  scenario: Scenario;
  scenarioMap: Record<Scenario, number>;
  field: ReturnType<typeof buildValueMarks>;
  bridge: ReturnType<typeof buildBridgeRows>;
  shares: number | null;
  sensitivity: ReturnType<typeof buildSensitivityGrid>;
  compact: boolean;
  projections: ProjectionRow[];
  startingRevenue: number | null;
  disclaimer: string;
  onStep: (kind: AssumptionKind, direction: -1 | 1) => void;
  onScenario: (scenario: Scenario) => void;
}) {
  const fairLabel = formatSharePrice(fairValue);
  const growth = formatAssumptionPercent(assumptions.revenueGrowth, 'growth');
  const margin = formatAssumptionPercent(assumptions.operatingMargin, 'margin');
  const discount = formatAssumptionPercent(assumptions.discountRate, 'discount');
  const terminal = formatAssumptionPercent(assumptions.terminalGrowth, 'terminal');
  const shown: Record<AssumptionKind, string> = {
    growth,
    margin,
    discount,
    terminal,
  };

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.kicker}>
          <span className={styles.accent}>Valuation memo</span>
          <span aria-hidden="true">·</span>
          <span>
            {ticker} · {name}
          </span>
          <span className={styles.fullOnly} aria-hidden="true">·</span>
          <span className={styles.fullOnly}>{label}</span>
          <span className={styles.compactOnly}>· {label}</span>
        </div>
        <h1 className={styles.headline}>
          {shortName} looks worth <strong>{fairLabel}</strong> a share
          {price !== null ? <>, {gapPhrase(fairValue, price)} where it trades today.</> : '.'}
        </h1>
        <p className={styles.lede}>
          If revenue grows <Stepper kind="growth" shown={growth} onStep={onStep} /> a year for five years at a{' '}
          <Stepper kind="margin" shown={margin} onStep={onStep} /> operating margin, and cash flows are discounted at{' '}
          <Stepper kind="discount" shown={discount} onStep={onStep} /> with{' '}
          <Stepper kind="terminal" shown={terminal} onStep={onStep} /> growth forever after.
        </p>
        <p className={styles.phoneLede}>
          If revenue grows <strong>{growth}</strong> a year at a <strong>{margin}</strong> margin, discounted at{' '}
          <strong>{discount}</strong>, with <strong>{terminal}</strong> growth forever after.
        </p>
        <div className={styles.stepList}>
          {assumptionFields().map((fieldItem) => (
            <div key={fieldItem.kind} className={styles.stepRow}>
              <span className={styles.stepName}>{fieldItem.label}</span>
              <Stepper kind={fieldItem.kind} shown={shown[fieldItem.kind]} onStep={onStep} />
            </div>
          ))}
        </div>
        <div className={styles.cases}>
          <span className={styles.caseLabel}>Start from a case</span>
          {SCENARIOS.map((item) => {
            const selected = scenario === item && label !== 'Your case';
            return (
              <button
                key={item}
                type="button"
                className={cn(styles.chip, selected && styles.chipSelected)}
                aria-pressed={selected}
                onClick={() => onScenario(item)}
              >
                {SCENARIO_LABELS[item]} · {formatSharePrice(scenarioMap[item], 0)}
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.section} aria-label="Where the value lands">
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Where the value lands</h2>
          <span className={`${styles.sectionMeta} ${styles.fullOnly}`}>Per share, against today&apos;s price</span>
        </div>
        <div className={styles.field} role="img" aria-label={field.alt}>
          <div className={styles.fieldLine} />
          <div className={styles.fieldBand} style={{ left: `${field.bandLeft}%`, width: `${field.bandWidth}%` }} />
          {field.marks.map((mark) => (
            <div
              key={mark.label}
              className={cn(styles.mark, mark.placement === 'above' ? styles.markAbove : styles.markBelow)}
              style={{ left: `${mark.left}%` }}
            >
              <span
                className={cn(
                  mark.emphasis ? styles.markDotEmphasis : styles.markDot,
                  mark.label === 'Price' && styles.markPrice,
                )}
              />
              <span className={cn(styles.markValue, mark.emphasis && styles.markValueEmphasis)}>
                <span className={styles.fullOnly}>{mark.value}</span>
                <span className={styles.compactOnly}>{mark.compactValue}</span>
              </span>
              <span className={styles.markLabel}>
                <span className={styles.fullOnly}>{mark.label}</span>
                <span className={styles.compactOnly}>{mark.compactLabel}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>From cash flow to share price</h2>
          <span className={`${styles.sectionMeta} ${styles.fullOnly}`}>USD billions</span>
        </div>
        <div>
          {bridge.map((row) => (
            <div key={row.label} className={styles.bridgeRow}>
              <span className={cn(styles.bridgeLabel, row.emphasis && styles.emphasis)}>{row.label}</span>
              <span className={styles.track}>
                <span
                  className={cn(styles.bar, barClass(row.tone))}
                  style={{ left: `${row.left}%`, width: `${Math.max(row.width, 1.5)}%` }}
                />
              </span>
              <span
                className={cn(
                  styles.bridgeValue,
                  row.emphasis && styles.emphasis,
                  row.tone === 'cash' && styles.positive,
                  row.tone === 'debt' && styles.negative,
                )}
              >
                {row.valueLabel}
              </span>
            </div>
          ))}
          <div className={styles.shareRow}>
            <span className={styles.shareLabel}>{shares ? `÷ ${formatShareCount(shares)} shares` : 'Per share'}</span>
            <span className={styles.shareValue}>{fairLabel}</span>
          </div>
        </div>
      </section>

      <section className={cn(styles.section, styles.columns)}>
        <div className={styles.block}>
          <h2 className={styles.blockTitle}>If we&apos;re wrong</h2>
          <p className={cn(styles.blockCopy, styles.fullOnly)}>
            Fair value per share as growth (across) and the discount rate (down) shift from the memo&apos;s case. Shaded cells sit above today&apos;s price.
          </p>
          <p className={cn(styles.blockCopy, styles.phoneNote)}>
            Growth across, discount rate down. Shaded cells sit above today&apos;s price.
          </p>
          <div className={styles.scroll}>
            <div
              className={styles.sens}
              role="img"
              aria-label="Sensitivity grid of fair values"
              style={{
                gridTemplateColumns: `${compact ? 48 : 60}px repeat(${Math.max(sensitivity.columns - 1, 1)}, minmax(${compact ? 0 : 56}px, 1fr))`,
              }}
            >
              {sensitivity.cells.map((cell, index) => (
                <div
                  key={`${cell.role}-${index}`}
                  className={cn(
                    styles.sensCell,
                    cell.role !== 'value' && styles.sensHeader,
                    cell.abovePrice && styles.sensAbove,
                    cell.isBase && styles.sensBase,
                  )}
                >
                  {cell.text}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className={styles.block}>
          <h2 className={styles.blockTitle}>The five years modeled</h2>
          {startingRevenue !== null ? (
            <p className={cn(styles.blockCopy, styles.desktopNote)}>
              Starting from {formatStartingRevenue(startingRevenue)} of revenue. USD billions.
            </p>
          ) : null}
          <div className={styles.scroll}>
            <div>
              <div className={styles.tableHead}>
                <span>Year</span>
                <span>
                  <span className={styles.fullOnly}>Revenue</span>
                  <span className={styles.compactOnly}>Rev.</span>
                </span>
                <span>EBIT</span>
                <span>
                  <span className={styles.fullOnly}>Free cash flow</span>
                  <span className={styles.compactOnly}>FCF</span>
                </span>
              </div>
              {projections.map((row) => (
                <div key={row.year} className={styles.tableRow}>
                  <span className={styles.year}>
                    <span className={styles.fullOnly}>{projectionYearLabel(row.year, false)}</span>
                    <span className={styles.compactOnly}>{projectionYearLabel(row.year, true)}</span>
                  </span>
                  <span>{formatBillions(row.revenue ?? 0)}</span>
                  <span>{formatBillions(row.ebit ?? 0)}</span>
                  <span className={styles.fcf}>{formatBillions(row.freeCashFlow ?? 0)}</span>
                </div>
              ))}
            </div>
          </div>
          {startingRevenue !== null ? (
            <span className={styles.phoneNote}>USD billions, from {formatStartingRevenue(startingRevenue)} of revenue.</span>
          ) : null}
        </div>
      </section>
      <footer className={styles.footer}>{disclaimer}</footer>
    </div>
  );
}

function Stepper({
  kind,
  shown,
  onStep,
}: {
  kind: AssumptionKind;
  shown: string;
  onStep: (kind: AssumptionKind, direction: -1 | 1) => void;
}) {
  const field = assumptionFields().find((item) => item.kind === kind);
  const label = field?.label.toLowerCase() ?? 'assumption';
  return (
    <span className={styles.stepper}>
      <button type="button" className={styles.step} aria-label={`Lower ${label}`} onClick={() => onStep(kind, -1)}>
        −
      </button>
      <span className={styles.stepValue}>{shown}</span>
      <button type="button" className={styles.step} aria-label={`Raise ${label}`} onClick={() => onStep(kind, 1)}>
        +
      </button>
    </span>
  );
}

function barClass(tone: ReturnType<typeof buildBridgeRows>[number]['tone']): string {
  switch (tone) {
    case 'explicit':
      return styles.barExplicit;
    case 'terminal':
      return styles.barTerminal;
    case 'cash':
      return styles.barCash;
    case 'debt':
      return styles.barDebt;
    case 'equity':
      return styles.barEquity;
    default: {
      const neverTone: never = tone;
      return neverTone;
    }
  }
}

function readScenarioValues(
  details: DcfResult | ValuationReplaySnapshot | null,
  isDemo: boolean,
): Record<Scenario, number> {
  const fallback = isDemo ? scenarioValues : { base: 0, bull: 0, bear: 0 };
  if (!details) {
    return fallback;
  }
  if (isComputeResult(details)) {
    return {
      base: details.scenarios.base ?? fallback.base,
      bull: details.scenarios.bull ?? fallback.bull,
      bear: details.scenarios.bear ?? fallback.bear,
    };
  }
  return {
    base: details.scenarios.base.fairValue,
    bull: details.scenarios.bull.fairValue,
    bear: details.scenarios.bear.fairValue,
  };
}

function readProjections(details: DcfResult | ValuationReplaySnapshot | null): ProjectionRow[] {
  return details?.projections ?? [];
}

function readStatement(details: DcfResult | ValuationReplaySnapshot | null): StatementHistoryPoint | null {
  return details?.statementHistory[0] ?? null;
}

function readBridge(details: DcfResult | ValuationReplaySnapshot | null) {
  if (details && isComputeResult(details)) {
    return details.valueBridge;
  }
  return undefined;
}

function readOffsets(details: DcfResult | ValuationReplaySnapshot | null): { growth: number[]; wacc: number[] } {
  return {
    growth: details?.sensitivity?.growthOffsets ?? [-4, -3, -2, -1, 0, 1, 2, 3, 4],
    wacc: details?.sensitivity?.waccOffsets ?? [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2],
  };
}

export function LabMemo() {
  return (
    <WorkbenchProvider>
      <LabMemoBody />
    </WorkbenchProvider>
  );
}
