from __future__ import annotations

from dcf_engine.workbench.run import run_workbench
from dcf_engine.workbench.schema import MonteCarloOneFactor, MonteCarloSpec, ScenarioAssumptions, WorkbenchRequest


def test_workbench_monte_carlo_deterministic() -> None:
    request = WorkbenchRequest(
        base_year=2024,
        periods=3,
        revenue_t0=100.0,
        cash=10.0,
        debt=20.0,
        shares_outstanding=10.0,
        base=ScenarioAssumptions(
            revenue_growth=0.08,
            ebit_margin=0.20,
            tax_rate=0.25,
            sales_to_capital=2.0,
            wacc=0.09,
            g_stable=0.02,
            wacc_stable=0.08,
        ),
        bull=ScenarioAssumptions(
            revenue_growth=0.10,
            ebit_margin=0.24,
            tax_rate=0.22,
            sales_to_capital=2.5,
            wacc=0.08,
            g_stable=0.025,
            wacc_stable=0.075,
        ),
        bear=ScenarioAssumptions(
            revenue_growth=0.05,
            ebit_margin=0.16,
            tax_rate=0.28,
            sales_to_capital=1.5,
            wacc=0.10,
            g_stable=0.015,
            wacc_stable=0.085,
        ),
        monte_carlo=MonteCarloSpec(runs=250, seed=123, bins=25),
    )

    response = run_workbench(request)
    assert response.monte_carlo is not None
    mc = response.monte_carlo
    assert mc.runs == 250
    assert mc.seed == 123
    assert len(mc.histogram.bin_centers) == len(mc.histogram.density)
    assert mc.summary.min <= mc.summary.p10 <= mc.summary.p25 <= mc.summary.median
    assert mc.summary.median <= mc.summary.p75 <= mc.summary.p90 <= mc.summary.max
    assert abs(max(mc.histogram.density) - 1.0) < 1e-12

    response_again = run_workbench(request)
    assert response_again.monte_carlo is not None
    assert response_again.monte_carlo.summary.model_dump() == mc.summary.model_dump()
    assert response_again.monte_carlo.histogram.model_dump() == mc.histogram.model_dump()


def test_workbench_monte_carlo_one_factor_deterministic() -> None:
    request = WorkbenchRequest(
        base_year=2024,
        periods=3,
        revenue_t0=100.0,
        cash=10.0,
        debt=20.0,
        shares_outstanding=10.0,
        base=ScenarioAssumptions(
            revenue_growth=0.08,
            ebit_margin=0.20,
            tax_rate=0.25,
            sales_to_capital=2.0,
            wacc=0.09,
            g_stable=0.02,
            wacc_stable=0.08,
        ),
        bull=ScenarioAssumptions(
            revenue_growth=0.10,
            ebit_margin=0.24,
            tax_rate=0.22,
            sales_to_capital=2.5,
            wacc=0.08,
            g_stable=0.025,
            wacc_stable=0.075,
        ),
        bear=ScenarioAssumptions(
            revenue_growth=0.05,
            ebit_margin=0.16,
            tax_rate=0.28,
            sales_to_capital=1.5,
            wacc=0.10,
            g_stable=0.015,
            wacc_stable=0.085,
        ),
        monte_carlo=MonteCarloSpec(
            runs=400,
            seed=7,
            bins=30,
            dependence=MonteCarloOneFactor(loading=0.8),
        ),
    )

    response = run_workbench(request)
    assert response.monte_carlo is not None
    mc = response.monte_carlo
    assert mc.runs == 400
    assert mc.seed == 7
    assert abs(max(mc.histogram.density) - 1.0) < 1e-12

    response_again = run_workbench(request)
    assert response_again.monte_carlo is not None
    assert response_again.monte_carlo.summary.model_dump() == mc.summary.model_dump()
    assert response_again.monte_carlo.histogram.model_dump() == mc.histogram.model_dump()

    # Ensure this mode differs from independent sampling with the same seed.
    independent_request = request.model_copy(
        update={
            "monte_carlo": MonteCarloSpec(runs=400, seed=7, bins=30),
        }
    )
    independent_response = run_workbench(independent_request)
    assert independent_response.monte_carlo is not None
    assert independent_response.monte_carlo.summary.model_dump() != mc.summary.model_dump()
