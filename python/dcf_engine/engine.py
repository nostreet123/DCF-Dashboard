from __future__ import annotations

from dcf_engine.bridge import build_bridge
from dcf_engine.discounting import discount_fcff
from dcf_engine.forecast import build_forecast
from dcf_engine.schedules import build_schedule
from dcf_engine.schema import (
    InputAssumptions,
    NormalizedAssumptions,
    REQUIRED_PERIOD_SERIES_FIELDS,
    Trace,
    ValuationResult,
)
from dcf_engine.validation import ensure_list_length


def _validate_required_period_series(inputs: InputAssumptions, periods: int) -> None:
    ensure_list_length("revenue_growth", inputs.revenue_growth, periods)
    for name in REQUIRED_PERIOD_SERIES_FIELDS:
        ensure_list_length(name, getattr(inputs, name), periods)


def _normalize(inputs: InputAssumptions) -> NormalizedAssumptions:
    periods = inputs.periods
    _validate_required_period_series(inputs, periods)

    return NormalizedAssumptions(
        base_year=inputs.base_year,
        periods=periods,
        currency=inputs.currency,
        revenue_t0=inputs.revenue_t0,
        revenue_growth=inputs.revenue_growth,
        ebit_margin=inputs.ebit_margin,
        tax_rate=inputs.tax_rate,
        sales_to_capital=inputs.sales_to_capital,
        reinvestment_lag_years=inputs.reinvestment_lag_years,
        wacc=inputs.wacc,
        g_stable=inputs.g_stable,
        wacc_stable=inputs.wacc_stable,
        cash=inputs.cash,
        debt=inputs.debt,
        other_non_operating_assets=inputs.other_non_operating_assets,
        shares_outstanding=inputs.shares_outstanding,
        failure_probability=inputs.failure_probability,
        distress_recovery_fraction=inputs.distress_recovery_fraction,
    )


class DCFEngine:
    def run(self, inputs: InputAssumptions) -> tuple[ValuationResult, Trace]:
        normalized = _normalize(inputs)
        schedule = build_schedule(normalized.base_year, normalized.periods)
        forecast = build_forecast(normalized)
        discounting = discount_fcff(normalized, forecast.fcff)
        pv_fcff_total = sum(discounting.pv_fcff)
        firm_value = pv_fcff_total + discounting.pv_terminal
        bridge = build_bridge(normalized, firm_value)

        result = ValuationResult(
            firm_value=firm_value,
            pv_fcff=pv_fcff_total,
            terminal_value=discounting.terminal_value,
            pv_terminal=discounting.pv_terminal,
            equity_value=bridge.equity_value,
            equity_value_adjusted=bridge.equity_value_adjusted,
            value_per_share=bridge.value_per_share,
            fair_value_per_share=bridge.fair_value_per_share,
        )
        trace = Trace(
            schedule=schedule,
            forecast=forecast,
            discounting=discounting,
            bridge=bridge,
        )
        return result, trace
