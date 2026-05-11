from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from dcf_engine.schema import Trace, ValuationResult

MAX_FORECAST_PERIODS = 50
MAX_SENSITIVITY_OFFSETS = 21
MAX_STATEMENTS = 120
SensitivityOffset = Annotated[float, Field(ge=-0.5, le=0.5)]


class WorkbenchBaseModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class ScenarioAssumptions(WorkbenchBaseModel):
    revenue_growth: float = Field(
        ...,
        alias="revenueGrowth",
        description="Annual revenue growth rate.",
    )
    ebit_margin: float = Field(..., alias="ebitMargin", description="EBIT margin.")
    tax_rate: float = Field(..., alias="taxRate", description="Tax rate.")
    sales_to_capital: float = Field(
        ...,
        alias="salesToCapital",
        description="Sales-to-capital ratio.",
    )
    wacc: float = Field(..., description="WACC.")
    g_stable: float = Field(..., alias="gStable", description="Stable growth rate.")
    wacc_stable: float = Field(..., alias="waccStable", description="Stable WACC.")


class SensitivitySpec(WorkbenchBaseModel):
    growth_offsets: list[SensitivityOffset] = Field(
        default_factory=lambda: [
            -0.04,
            -0.03,
            -0.02,
            -0.01,
            0.0,
            0.01,
            0.02,
            0.03,
            0.04,
        ],
        alias="growthOffsets",
        max_length=MAX_SENSITIVITY_OFFSETS,
        description="Offsets applied to revenue growth.",
    )
    wacc_offsets: list[SensitivityOffset] = Field(
        default_factory=lambda: [
            -0.04,
            -0.03,
            -0.02,
            -0.01,
            0.0,
            0.01,
            0.02,
            0.03,
            0.04,
        ],
        alias="waccOffsets",
        max_length=MAX_SENSITIVITY_OFFSETS,
        description="Offsets applied to WACC.",
    )


class MonteCarloIndependence(WorkbenchBaseModel):
    model: Literal["independent"] = Field(
        "independent",
        description="Sample each input independently.",
    )


class MonteCarloOneFactor(WorkbenchBaseModel):
    model: Literal["oneFactor"] = Field(
        "oneFactor",
        description="Sample inputs from a shared latent factor plus idiosyncratic noise.",
    )
    loading: float = Field(
        0.75,
        ge=0.0,
        le=0.99,
        description=(
            "Magnitude of the common factor loading. Same-sign inputs have "
            "approximate normal-space correlation of loading^2."
        ),
    )


MonteCarloDependenceSpec = Annotated[
    MonteCarloIndependence | MonteCarloOneFactor,
    Field(discriminator="model"),
]


class MonteCarloSpec(WorkbenchBaseModel):
    runs: int = Field(
        2000,
        ge=100,
        le=100_000,
        description="Number of Monte Carlo simulations.",
    )
    seed: int | None = Field(
        None,
        description="Optional random seed for deterministic results.",
    )
    bins: int | None = Field(
        None,
        ge=10,
        le=200,
        description="Optional histogram bin count for mini distribution output.",
    )
    dependence: MonteCarloDependenceSpec | None = Field(
        None,
        description="Optional dependence model for correlated sampling.",
    )


class StatementInput(WorkbenchBaseModel):
    period_end: str = Field(..., alias="periodEnd", description="Period end date.")
    revenue: float | None = Field(None, description="Revenue.")
    operating_income: float | None = Field(
        None,
        alias="operatingIncome",
        description="Operating income.",
    )
    operating_margin: float | None = Field(
        None,
        alias="operatingMargin",
        description="Operating margin.",
    )
    cash: float | None = Field(None, description="Cash balance.")
    debt: float | None = Field(None, description="Debt balance.")
    shares_outstanding: float | None = Field(
        None,
        alias="sharesOutstanding",
        description="Shares outstanding.",
    )


class WorkbenchRequest(WorkbenchBaseModel):
    scenario: Literal["base", "bull", "bear"] = Field(
        "base",
        description="Active dashboard scenario used for sensitivity and KPI context.",
    )
    base_year: int = Field(..., alias="baseYear", description="Base year for t=0.")
    periods: int = Field(
        10,
        ge=1,
        le=MAX_FORECAST_PERIODS,
        description="Forecast periods.",
    )
    currency: str | None = Field(None, description="Reporting currency.")
    revenue_t0: float = Field(..., alias="revenueT0", description="Base revenue.")
    cash: float = Field(0.0, description="Cash balance.")
    debt: float = Field(0.0, description="Debt balance.")
    other_non_operating_assets: float = Field(
        0.0,
        alias="otherNonOperatingAssets",
        description="Other non-operating assets.",
    )
    shares_outstanding: float = Field(
        ..., alias="sharesOutstanding", description="Shares outstanding."
    )
    reinvestment_lag_years: int = Field(
        0,
        ge=0,
        alias="reinvestmentLagYears",
        description="Reinvestment lag years.",
    )
    base: ScenarioAssumptions = Field(..., description="Base scenario assumptions.")
    bull: ScenarioAssumptions = Field(..., description="Bull scenario assumptions.")
    bear: ScenarioAssumptions = Field(..., description="Bear scenario assumptions.")
    sensitivity: SensitivitySpec | None = Field(
        None,
        description="Sensitivity grid configuration.",
    )
    monte_carlo: MonteCarloSpec | None = Field(
        None,
        alias="monteCarlo",
        description="Optional Monte Carlo simulation configuration.",
    )
    statements: list[StatementInput] | None = Field(
        None,
        max_length=MAX_STATEMENTS,
        description="Optional statements for KPI history.",
    )
    include_trace: bool = Field(
        False,
        alias="includeTrace",
        description="Include full trace output.",
    )


KpiDirection = Literal["higher", "lower"]


class KpiValue(WorkbenchBaseModel):
    key: str = Field(..., description="KPI key.")
    label: str = Field(..., description="KPI label.")
    value: float | None = Field(None, description="Raw KPI value.")
    score: float | None = Field(None, description="Score (0-100).")
    direction: KpiDirection = Field(..., description="Scoring direction.")
    unit: str | None = Field(None, description="Unit label.")


class KpiHistoryPoint(WorkbenchBaseModel):
    period_end: str = Field(..., alias="periodEnd", description="Period end date.")
    revenue: float | None = Field(None, description="Revenue.")
    operating_income: float | None = Field(
        None,
        alias="operatingIncome",
        description="Operating income.",
    )
    operating_margin: float | None = Field(
        None,
        alias="operatingMargin",
        description="Operating margin.",
    )
    cash: float | None = Field(None, description="Cash.")
    debt: float | None = Field(None, description="Debt.")
    shares_outstanding: float | None = Field(
        None,
        alias="sharesOutstanding",
        description="Shares outstanding.",
    )


class KpiSummary(WorkbenchBaseModel):
    kpis: list[KpiValue] = Field(default_factory=list, description="KPI summary list.")
    history: list[KpiHistoryPoint] = Field(
        default_factory=list, description="KPI history list."
    )


class ScenarioResult(WorkbenchBaseModel):
    label: str = Field(..., description="Scenario label.")
    assumptions: ScenarioAssumptions = Field(..., description="Scenario inputs.")
    valuation: ValuationResult = Field(..., description="Valuation output.")
    trace: Trace | None = Field(None, description="Optional trace output.")


class SensitivityResult(WorkbenchBaseModel):
    growth_offsets: list[float] = Field(
        default_factory=list, alias="growthOffsets", description="Growth offsets."
    )
    wacc_offsets: list[float] = Field(
        default_factory=list, alias="waccOffsets", description="WACC offsets."
    )
    values: list[list[float]] = Field(
        default_factory=list, description="Heatmap values; rows are WACC offsets and columns are growth offsets."
    )


class MonteCarloSummary(WorkbenchBaseModel):
    min: float = Field(..., description="Minimum simulated fair value per share.")
    max: float = Field(..., description="Maximum simulated fair value per share.")
    mean: float = Field(..., description="Mean simulated fair value per share.")
    median: float = Field(..., description="Median simulated fair value per share.")
    p10: float = Field(..., description="10th percentile fair value per share.")
    p25: float = Field(..., description="25th percentile fair value per share.")
    p75: float = Field(..., description="75th percentile fair value per share.")
    p90: float = Field(..., description="90th percentile fair value per share.")


class MonteCarloHistogram(WorkbenchBaseModel):
    bin_centers: list[float] = Field(
        default_factory=list,
        alias="binCenters",
        description="Histogram bin centers for plotting a mini distribution.",
    )
    density: list[float] = Field(
        default_factory=list,
        description="Normalized density heights (max=1).",
    )


class MonteCarloResult(WorkbenchBaseModel):
    runs: int = Field(..., description="Completed simulation runs.")
    seed: int | None = Field(None, description="Random seed used (if provided).")
    summary: MonteCarloSummary = Field(..., description="Distribution summary stats.")
    histogram: MonteCarloHistogram = Field(
        ..., description="Histogram data for UI mini distribution."
    )


class WorkbenchResponse(WorkbenchBaseModel):
    base: ScenarioResult
    bull: ScenarioResult
    bear: ScenarioResult
    sensitivity: SensitivityResult
    kpis: KpiSummary
    monte_carlo: MonteCarloResult | None = Field(
        None,
        alias="monteCarlo",
        description="Optional Monte Carlo output for the base scenario.",
    )
