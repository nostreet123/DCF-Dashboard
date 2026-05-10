from __future__ import annotations

from dcf_engine.forecast import build_forecast
from dcf_engine.schema import NormalizedAssumptions


def test_forecast_zero_tax_behaves_like_nol():
    inputs = NormalizedAssumptions(
        base_year=2024,
        periods=1,
        currency=None,
        revenue_t0=100.0,
        revenue_growth=[0.0],
        ebit_margin=[0.2],
        tax_rate=[0.0],
        sales_to_capital=[2.0],
        reinvestment_lag_years=0,
        wacc=[0.1],
        g_stable=0.02,
        wacc_stable=0.08,
        cash=0.0,
        debt=0.0,
        other_non_operating_assets=0.0,
        shares_outstanding=10.0,
        failure_probability=None,
        distress_recovery_fraction=None,
    )

    forecast = build_forecast(inputs)
    assert forecast.nopat[0] == forecast.ebit[0]
