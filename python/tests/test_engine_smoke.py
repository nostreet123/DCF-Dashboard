from __future__ import annotations

import pytest

from dcf_engine.engine import DCFEngine
from dcf_engine.schema import InputAssumptions
import dcf_engine.schema as schema


def test_engine_smoke_constant_pv() -> None:
    inputs = InputAssumptions(
        base_year=2024,
        currency=None,
        periods=3,
        revenue_t0=100.0,
        revenue_growth=[0.0, 0.0, 0.0],
        ebit_margin=[1.0, 1.0, 1.0],
        tax_rate=[0.0, 0.0, 0.0],
        sales_to_capital=[2.0, 2.0, 2.0],
        reinvestment_lag_years=0,
        wacc=[0.1, 0.1, 0.1],
        g_stable=0.0,
        wacc_stable=0.1,
        cash=0.0,
        debt=0.0,
        other_non_operating_assets=0.0,
        shares_outstanding=10.0,
        failure_probability=None,
        distress_recovery_fraction=None,
    )

    engine = DCFEngine()
    result, trace = engine.run(inputs)

    expected_pv_fcff = sum(100.0 / (1.1**t) for t in range(1, 4))
    expected_terminal = 100.0 / 0.1
    expected_pv_terminal = expected_terminal / (1.1**3)

    assert result.pv_fcff == pytest.approx(expected_pv_fcff)
    assert result.pv_terminal == pytest.approx(expected_pv_terminal)
    assert result.firm_value == pytest.approx(expected_pv_fcff + expected_pv_terminal)
    assert trace.discounting.terminal_value == pytest.approx(expected_terminal)


def test_required_period_series_fields_alias_backwards_compatible() -> None:
    assert schema.REQUIRED_PERIOD_SERIES_FIELDS == schema.PERIOD_SERIES_FIELDS
