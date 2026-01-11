from __future__ import annotations

from dcf_engine.bridge import build_bridge
from dcf_engine.schema import NormalizedAssumptions


def test_bridge_with_distress_adjustment():
    inputs = NormalizedAssumptions(
        base_year=2024,
        periods=1,
        currency=None,
        revenue_t0=100.0,
        revenue_growth=[0.0],
        ebit_margin=[0.0],
        tax_rate=[0.0],
        sales_to_capital=[1.0],
        reinvestment_lag_years=0,
        wacc=[0.1],
        g_stable=0.02,
        wacc_stable=0.08,
        cash=10.0,
        debt=20.0,
        other_non_operating_assets=5.0,
        shares_outstanding=10.0,
        failure_probability=0.2,
        distress_recovery_fraction=0.5,
    )

    bridge = build_bridge(inputs, firm_value=100.0)
    assert round(bridge.equity_value, 6) == 95.0
    assert round(bridge.equity_value_adjusted or 0.0, 6) == 85.5
    assert round(bridge.value_per_share, 6) == 8.55
