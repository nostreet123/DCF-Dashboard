from __future__ import annotations

import pytest

from dcf_engine.workbench.run import run_workbench
from dcf_engine.workbench.schema import (
    ScenarioAssumptions,
    SensitivitySpec,
    WorkbenchRequest,
)


def _scenario(
    revenue_growth: float,
    ebit_margin: float,
    wacc: float,
    g_stable: float,
    wacc_stable: float,
) -> ScenarioAssumptions:
    return ScenarioAssumptions(
        revenue_growth=revenue_growth,
        ebit_margin=ebit_margin,
        tax_rate=0.25,
        sales_to_capital=2.0,
        wacc=wacc,
        g_stable=g_stable,
        wacc_stable=wacc_stable,
    )


def _request(
    scenario: str = "base",
    sensitivity: SensitivitySpec | None = None,
) -> WorkbenchRequest:
    return WorkbenchRequest(
        scenario=scenario,
        base_year=2024,
        periods=5,
        revenue_t0=100.0,
        cash=10.0,
        debt=20.0,
        shares_outstanding=10.0,
        base=_scenario(
            revenue_growth=0.08,
            ebit_margin=0.20,
            wacc=0.09,
            g_stable=0.02,
            wacc_stable=0.08,
        ),
        bull=_scenario(
            revenue_growth=0.14,
            ebit_margin=0.26,
            wacc=0.08,
            g_stable=0.025,
            wacc_stable=0.075,
        ),
        bear=_scenario(
            revenue_growth=0.03,
            ebit_margin=0.15,
            wacc=0.11,
            g_stable=0.015,
            wacc_stable=0.09,
        ),
        sensitivity=sensitivity,
    )


def test_sensitivity_rows_are_wacc_and_columns_are_growth() -> None:
    response = run_workbench(
        _request(
            sensitivity=SensitivitySpec(
                growth_offsets=[-0.01, 0.0, 0.01],
                wacc_offsets=[-0.01, 0.0, 0.01],
            ),
        )
    )

    values = response.sensitivity.values
    assert values[1][1] == pytest.approx(response.base.valuation.fair_value_per_share)
    assert values[1][0] < values[1][1] < values[1][2]
    assert values[0][1] > values[1][1] > values[2][1]


def test_sensitivity_zero_offset_uses_active_scenario() -> None:
    response = run_workbench(
        _request(
            scenario="bull",
            sensitivity=SensitivitySpec(growth_offsets=[0.0], wacc_offsets=[0.0]),
        )
    )

    assert response.sensitivity.values == [
        [pytest.approx(response.bull.valuation.fair_value_per_share)]
    ]
    assert response.sensitivity.values[0][0] != pytest.approx(
        response.base.valuation.fair_value_per_share
    )
