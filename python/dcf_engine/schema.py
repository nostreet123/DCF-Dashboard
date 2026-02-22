from __future__ import annotations

from pydantic import BaseModel, Field


PERIOD_SERIES_FIELDS: tuple[str, ...] = (
    "revenue_growth",
    "ebit_margin",
    "tax_rate",
    "sales_to_capital",
    "wacc",
)

REQUIRED_PERIOD_SERIES_FIELDS: tuple[str, ...] = (
    "ebit_margin",
    "tax_rate",
    "sales_to_capital",
    "wacc",
)


class InputAssumptions(BaseModel):
    base_year: int = Field(..., description="Base year for t=0.")
    currency: str | None = Field(None, description="Reporting currency code.")
    periods: int = Field(10, ge=1, description="Number of explicit forecast years.")

    revenue_t0: float = Field(..., description="Revenue at t=0.")
    revenue_growth: list[float] = Field(
        ..., description="Revenue growth for years t=1..N."
    )
    ebit_margin: list[float] | None = Field(
        None, description="EBIT margin for years t=1..N."
    )
    tax_rate: list[float] | None = Field(
        None, description="Tax rate for years t=1..N."
    )
    sales_to_capital: list[float] | None = Field(
        None, description="Sales-to-capital for years t=1..N."
    )
    reinvestment_lag_years: int = Field(
        0, ge=0, description="Lag applied to sales-to-capital for reinvestment."
    )

    wacc: list[float] | None = Field(
        None, description="WACC for years t=1..N."
    )
    g_stable: float = Field(..., description="Stable growth rate used in terminal value.")
    wacc_stable: float = Field(
        ..., description="Stable WACC used in terminal value."
    )

    cash: float = Field(0.0, description="Excess cash added to firm value.")
    debt: float = Field(0.0, description="Debt subtracted from firm value.")
    other_non_operating_assets: float = Field(
        0.0, description="Other non-operating assets added to firm value."
    )
    shares_outstanding: float = Field(
        ..., gt=0, description="Shares outstanding for per-share value."
    )

    failure_probability: float | None = Field(
        None, description="Optional probability of failure for distress adjustment."
    )
    distress_recovery_fraction: float | None = Field(
        None, description="Optional recovery fraction if failure occurs."
    )


class NormalizedAssumptions(BaseModel):
    base_year: int
    periods: int
    currency: str | None
    revenue_t0: float
    revenue_growth: list[float]
    ebit_margin: list[float]
    tax_rate: list[float]
    sales_to_capital: list[float]
    reinvestment_lag_years: int
    wacc: list[float]
    g_stable: float
    wacc_stable: float
    cash: float
    debt: float
    other_non_operating_assets: float
    shares_outstanding: float
    failure_probability: float | None
    distress_recovery_fraction: float | None


class ForecastSchedule(BaseModel):
    t: list[int]
    years: list[int]


class ForecastTable(BaseModel):
    t: list[int]
    years: list[int]
    revenue: list[float]
    revenue_growth: list[float]
    ebit_margin: list[float]
    ebit: list[float]
    tax_rate: list[float]
    nopat: list[float]
    sales_to_capital: list[float]
    reinvestment: list[float]
    fcff: list[float]


class DiscountingTable(BaseModel):
    t: list[int]
    years: list[int]
    wacc: list[float]
    discount_factor: list[float]
    pv_fcff: list[float]
    terminal_value: float
    pv_terminal: float


class BridgeTable(BaseModel):
    firm_value: float
    cash: float
    other_non_operating_assets: float
    debt: float
    equity_value: float
    equity_value_adjusted: float | None
    shares_outstanding: float
    value_per_share: float
    fair_value_per_share: float


class ValuationResult(BaseModel):
    firm_value: float
    pv_fcff: float
    terminal_value: float
    pv_terminal: float
    equity_value: float
    equity_value_adjusted: float | None
    value_per_share: float
    fair_value_per_share: float


class Trace(BaseModel):
    schedule: ForecastSchedule
    forecast: ForecastTable
    discounting: DiscountingTable
    bridge: BridgeTable
