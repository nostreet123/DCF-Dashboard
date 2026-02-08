from __future__ import annotations

from dcf_engine.workbench.schema import ScenarioAssumptions, WorkbenchRequest


def _build_request_payload(base: dict[str, float]) -> dict[str, object]:
    return {
        "baseYear": 2024,
        "periods": 5,
        "revenueT0": 1000.0,
        "cash": 50.0,
        "debt": 200.0,
        "otherNonOperatingAssets": 10.0,
        "sharesOutstanding": 100.0,
        "reinvestmentLagYears": 1,
        "base": base,
        "bull": base,
        "bear": base,
    }


def test_workbench_request_accepts_camel_case_scenario_fields() -> None:
    payload = _build_request_payload(
        {
            "revenueGrowth": 0.05,
            "ebitMargin": 0.20,
            "taxRate": 0.25,
            "salesToCapital": 1.80,
            "wacc": 0.09,
            "gStable": 0.03,
            "waccStable": 0.08,
        }
    )

    request = WorkbenchRequest.model_validate(payload)

    assert request.base.revenue_growth == 0.05
    assert request.base.ebit_margin == 0.20
    assert request.base.tax_rate == 0.25
    assert request.base.sales_to_capital == 1.80
    assert request.base.g_stable == 0.03
    assert request.base.wacc_stable == 0.08


def test_workbench_request_accepts_snake_case_scenario_fields() -> None:
    payload = _build_request_payload(
        {
            "revenue_growth": 0.05,
            "ebit_margin": 0.20,
            "tax_rate": 0.25,
            "sales_to_capital": 1.80,
            "wacc": 0.09,
            "g_stable": 0.03,
            "wacc_stable": 0.08,
        }
    )

    request = WorkbenchRequest.model_validate(payload)

    assert request.base.revenue_growth == 0.05
    assert request.base.ebit_margin == 0.20
    assert request.base.tax_rate == 0.25
    assert request.base.sales_to_capital == 1.80
    assert request.base.g_stable == 0.03
    assert request.base.wacc_stable == 0.08


def test_scenario_assumptions_normalize_aliases_to_same_internal_model() -> None:
    camel_case = ScenarioAssumptions.model_validate(
        {
            "revenueGrowth": 0.05,
            "ebitMargin": 0.20,
            "taxRate": 0.25,
            "salesToCapital": 1.80,
            "wacc": 0.09,
            "gStable": 0.03,
            "waccStable": 0.08,
        }
    )
    snake_case = ScenarioAssumptions.model_validate(
        {
            "revenue_growth": 0.05,
            "ebit_margin": 0.20,
            "tax_rate": 0.25,
            "sales_to_capital": 1.80,
            "wacc": 0.09,
            "g_stable": 0.03,
            "wacc_stable": 0.08,
        }
    )

    assert camel_case.model_dump() == snake_case.model_dump()
