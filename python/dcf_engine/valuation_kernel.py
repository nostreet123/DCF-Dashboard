from __future__ import annotations

from typing import Sequence

import numpy as np
from numpy.typing import NDArray

from dcf_engine.bridge import build_bridge
from dcf_engine.discounting import discount_fcff
from dcf_engine.forecast import build_forecast
from dcf_engine.schema import NormalizedAssumptions, ValuationResult


def compute_terminal_value(
    fcff_last: float,
    *,
    g_stable: float,
    wacc_stable: float,
) -> float:
    if wacc_stable <= g_stable:
        raise ValueError("wacc_stable must be greater than g_stable")
    return (fcff_last * (1.0 + g_stable)) / (wacc_stable - g_stable)


def run_normalized_valuation(
    inputs: NormalizedAssumptions,
) -> tuple[ValuationResult, float]:
    """Scalar valuation path shared by DCFEngine and workbench scenarios."""
    forecast = build_forecast(inputs)
    discounting = discount_fcff(inputs, forecast.fcff)
    pv_fcff_total = sum(discounting.pv_fcff)
    firm_value = pv_fcff_total + discounting.pv_terminal
    bridge = build_bridge(inputs, firm_value)
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
    return result, firm_value


def compute_equity_value_per_share_vectorized(
    *,
    revenue_t0: float,
    growth: NDArray[np.float64],
    margin: NDArray[np.float64],
    tax: NDArray[np.float64],
    sales_to_capital: NDArray[np.float64],
    wacc: NDArray[np.float64],
    g_stable: NDArray[np.float64],
    wacc_stable: NDArray[np.float64],
    periods: int,
    reinvestment_lag_years: int,
    cash: float,
    debt: float,
    other_non_operating_assets: float,
    shares_outstanding: float,
) -> NDArray[np.float64]:
    """Vectorized FCFF valuation used by Monte Carlo simulation."""
    runs = int(growth.shape[0])
    if growth.shape != (runs, periods):
        raise ValueError("growth must have shape (runs, periods)")
    if np.any(sales_to_capital <= 0.0):
        raise ValueError("sales_to_capital samples must be positive")

    prior_revenue = np.full(runs, revenue_t0, dtype=np.float64)
    discount_factor = np.ones(runs, dtype=np.float64)
    pv_fcff = np.zeros(runs, dtype=np.float64)
    fcff = np.zeros(runs, dtype=np.float64)

    for idx in range(periods):
        current_revenue = prior_revenue * (1.0 + growth[:, idx])
        nopat = current_revenue * margin[:, idx] * (1.0 - tax[:, idx])
        lag_index = max(0, idx - reinvestment_lag_years)
        reinvestment = (current_revenue - prior_revenue) / sales_to_capital[:, lag_index]
        fcff = nopat - reinvestment
        discount_factor /= 1.0 + wacc[:, idx]
        pv_fcff += fcff * discount_factor
        prior_revenue = current_revenue

    spread = wacc_stable - g_stable
    if np.any(spread <= 0.0):
        raise ValueError("wacc_stable must be greater than g_stable for all samples")

    terminal_value = (fcff * (1.0 + g_stable)) / spread
    firm_value = pv_fcff + (terminal_value * discount_factor)
    equity_value = firm_value + cash + other_non_operating_assets - debt
    return equity_value / shares_outstanding


def assert_terminal_spreads_positive(*spreads: float) -> None:
    if any(spread <= 0 for spread in spreads):
        raise ValueError("wacc_stable must be greater than g_stable for all scenarios")


def as_float64_array(values: Sequence[float] | NDArray[np.float64]) -> NDArray[np.float64]:
    return np.asarray(values, dtype=np.float64)
