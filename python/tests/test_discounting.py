from __future__ import annotations

from dcf_engine.discounting import discount_fcff
from dcf_engine.schema import NormalizedAssumptions


def test_discounting_terminal_value():
    inputs = NormalizedAssumptions(
        base_year=2024,
        periods=2,
        currency=None,
        revenue_t0=100.0,
        revenue_growth=[0.0, 0.0],
        ebit_margin=[0.0, 0.0],
        tax_rate=[0.0, 0.0],
        sales_to_capital=[1.0, 1.0],
        reinvestment_lag_years=0,
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

    fcff = [10.0, 10.0]
    discounting = discount_fcff(inputs, fcff)

    assert round(discounting.discount_factor[0], 6) == round(1 / 1.1, 6)
    assert round(discounting.discount_factor[1], 6) == round(1 / (1.1**2), 6)
    assert round(discounting.pv_terminal, 6) == round(
        (10.0 * 1.02 / (0.08 - 0.02)) * discounting.discount_factor[1], 6
    )
