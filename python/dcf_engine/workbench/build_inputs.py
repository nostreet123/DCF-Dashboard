from __future__ import annotations

from dcf_engine.schema import InputAssumptions
from dcf_engine.workbench.schema import ScenarioAssumptions, WorkbenchRequest


def _repeat(value: float, periods: int) -> list[float]:
    return [value for _ in range(periods)]


def build_inputs(
    request: WorkbenchRequest,
    scenario: ScenarioAssumptions,
) -> InputAssumptions:
    periods = request.periods
    return InputAssumptions(
        base_year=request.base_year,
        periods=periods,
        currency=request.currency,
        revenue_t0=request.revenue_t0,
        revenue_growth=_repeat(scenario.revenue_growth, periods),
        ebit_margin=_repeat(scenario.ebit_margin, periods),
        tax_rate=_repeat(scenario.tax_rate, periods),
        sales_to_capital=_repeat(scenario.sales_to_capital, periods),
        reinvestment_lag_years=request.reinvestment_lag_years,
        wacc=_repeat(scenario.wacc, periods),
        g_stable=scenario.g_stable,
        wacc_stable=scenario.wacc_stable,
        cash=request.cash,
        debt=request.debt,
        other_non_operating_assets=request.other_non_operating_assets,
        shares_outstanding=request.shares_outstanding,
    )


def apply_offsets(
    inputs: InputAssumptions,
    growth_offset: float,
    wacc_offset: float,
) -> InputAssumptions:
    return InputAssumptions(
        base_year=inputs.base_year,
        periods=inputs.periods,
        currency=inputs.currency,
        revenue_t0=inputs.revenue_t0,
        revenue_growth=[value + growth_offset for value in inputs.revenue_growth],
        ebit_margin=inputs.ebit_margin,
        tax_rate=inputs.tax_rate,
        sales_to_capital=inputs.sales_to_capital,
        reinvestment_lag_years=inputs.reinvestment_lag_years,
        wacc=[value + wacc_offset for value in inputs.wacc],
        g_stable=inputs.g_stable,
        wacc_stable=inputs.wacc_stable,
        cash=inputs.cash,
        debt=inputs.debt,
        other_non_operating_assets=inputs.other_non_operating_assets,
        shares_outstanding=inputs.shares_outstanding,
        failure_probability=inputs.failure_probability,
        distress_recovery_fraction=inputs.distress_recovery_fraction,
    )
