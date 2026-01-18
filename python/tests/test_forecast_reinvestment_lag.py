from __future__ import annotations

import pytest

from dcf_engine.forecast import build_forecast
from dcf_engine.schema import NormalizedAssumptions


def test_reinvestment_lag():
    inputs = NormalizedAssumptions(
        base_year=2024,
        periods=2,
        currency=None,
        revenue_t0=100.0,
        revenue_growth=[0.1, 0.1],
        ebit_margin=[0.2, 0.2],
        tax_rate=[0.25, 0.25],
        sales_to_capital=[2.0, 4.0],
        reinvestment_lag_years=1,
        wacc=[0.1, 0.1],
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
    assert forecast.reinvestment[0] == pytest.approx(5.0)
    assert forecast.reinvestment[1] == pytest.approx(5.5)
