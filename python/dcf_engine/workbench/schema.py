from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from dcf_engine.schema import Trace, ValuationResult


class WorkbenchBaseModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class ScenarioAssumptions(WorkbenchBaseModel):
    revenue_growth: float = Field(..., description="Annual revenue growth rate.")
    ebit_margin: float = Field(..., description="EBIT margin.")
    tax_rate: float = Field(..., description="Tax rate.")
    sales_to_capital: float = Field(..., description="Sales-to-capital ratio.")
    wacc: float = Field(..., description="WACC.")
    g_stable: float = Field(..., description="Stable growth rate.")
    wacc_stable: float = Field(..., description="Stable WACC.")


class SensitivitySpec(WorkbenchBaseModel):
    growth_offsets: list[float] = Field(
        default_factory=lambda: [-0.02, -0.01, 0.0, 0.01, 0.02],
        alias="growthOffsets",
        description="Offsets applied to revenue growth.",
    )
    wacc_offsets: list[float] = Field(
        default_factory=lambda: [-0.02, -0.01, 0.0, 0.01, 0.02],
        alias="waccOffsets",
        description="Offsets applied to WACC.",
    )


class StatementInput(WorkbenchBaseModel):
    period_end: str = Field(..., alias="periodEnd", description="Period end date.")
    revenue: float | None = Field(None, description="Revenue.")
    cash: float | None = Field(None, description="Cash balance.")
    debt: float | None = Field(None, description="Debt balance.")
    shares_outstanding: float | None = Field(
        None,
        alias="sharesOutstanding",
        description="Shares outstanding.",
    )


class WorkbenchRequest(WorkbenchBaseModel):
    base_year: int = Field(..., alias="baseYear", description="Base year for t=0.")
    periods: int = Field(10, ge=1, description="Forecast periods.")
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
    statements: list[StatementInput] | None = Field(
        None,
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
        default_factory=list, description="Heatmap values."
    )


class WorkbenchResponse(WorkbenchBaseModel):
    base: ScenarioResult
    bull: ScenarioResult
    bear: ScenarioResult
    sensitivity: SensitivityResult
    kpis: KpiSummary
