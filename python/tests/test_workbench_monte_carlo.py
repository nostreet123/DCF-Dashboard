from __future__ import annotations

from dcf_engine.workbench.run import run_workbench
import numpy as np
import pytest

from dcf_engine.workbench.monte_carlo import (
    _build_histogram,
    _sample_dynamic_paths,
    _triangular_from_scenarios,
)
from dcf_engine.workbench.kpis import build_kpi_history
from dcf_engine.workbench.schema import (
    MonteCarloOneFactor,
    MonteCarloSpec,
    ScenarioAssumptions,
    StatementInput,
    WorkbenchRequest,
)


def test_histogram_uses_raw_empirical_bin_counts() -> None:
    histogram = _build_histogram([0, 1, 1, 2, 3, 4], bins=3)

    assert histogram.density == [0.5, 0.0, 1.0, 0.0, 0.0, 0.5, 0.0, 0.5, 0.0, 0.5]


def test_monte_carlo_spec_accepts_high_confidence_preset_size() -> None:
    spec = MonteCarloSpec(runs=100_000, seed=7, bins=160)

    assert spec.runs == 100_000


def test_workbench_request_caps_forecast_periods_before_monte_carlo_allocation() -> None:
    with pytest.raises(ValueError):
        WorkbenchRequest(
            baseYear=2024,
            periods=51,
            revenueT0=100.0,
            cash=10.0,
            debt=5.0,
            sharesOutstanding=10.0,
            base=ScenarioAssumptions(
                revenueGrowth=0.1,
                ebitMargin=0.2,
                taxRate=0.21,
                salesToCapital=2.0,
                wacc=0.09,
                terminalGrowth=0.025,
            ),
            bull=ScenarioAssumptions(
                revenueGrowth=0.14,
                ebitMargin=0.24,
                taxRate=0.2,
                salesToCapital=2.2,
                wacc=0.08,
                terminalGrowth=0.03,
            ),
            bear=ScenarioAssumptions(
                revenueGrowth=0.04,
                ebitMargin=0.14,
                taxRate=0.24,
                salesToCapital=1.6,
                wacc=0.11,
                terminalGrowth=0.015,
            ),
            monteCarlo=MonteCarloSpec(runs=100_000, seed=7, bins=160),
        )


def test_dynamic_paths_support_static_scenario_inputs() -> None:
    rng = np.random.default_rng(7)
    dist = _triangular_from_scenarios(base=0.25, bull=0.25, bear=0.25)

    paths = _sample_dynamic_paths(
        rng=rng,
        dist=dist,
        runs=10,
        periods=4,
        target=0.25,
    )

    assert np.all(paths == 0.25)


def test_monte_carlo_supports_degenerate_terminal_distributions() -> None:
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
            g_stable=0.02,
            wacc_stable=0.08,
        ),
        bear=ScenarioAssumptions(
            revenue_growth=0.05,
            ebit_margin=0.16,
            tax_rate=0.28,
            sales_to_capital=1.5,
            wacc=0.10,
            g_stable=0.02,
            wacc_stable=0.08,
        ),
        monte_carlo=MonteCarloSpec(runs=250, seed=123, bins=25),
    )

    response = run_workbench(request)

    assert response.monte_carlo is not None
    assert response.monte_carlo.summary.p10 <= response.monte_carlo.summary.p90


def test_dynamic_paths_mean_revert_instead_of_reusing_one_static_assumption() -> None:
    rng = np.random.default_rng(7)
    dist = _triangular_from_scenarios(base=0.12, bull=0.18, bear=0.06)
    target = np.full(2_000, 0.025)

    paths = _sample_dynamic_paths(
        rng=rng,
        dist=dist,
        runs=2_000,
        periods=10,
        target=target,
    )

    assert paths.shape == (2_000, 10)
    assert np.any(paths[:, 0] != paths[:, 1])
    assert abs(float(paths[:, -1].mean()) - 0.025) < abs(float(paths[:, 0].mean()) - 0.025)
    assert float(paths[:, -1].mean()) < dist.low


def test_kpi_history_includes_historical_operating_margin() -> None:
    history = build_kpi_history(
        [
            StatementInput(
                periodEnd="2025-12-31",
                revenue=100.0,
                operatingIncome=32.0,
                cash=10.0,
                debt=5.0,
                sharesOutstanding=10.0,
            )
        ]
    )

    assert history[0].operating_income == 32.0
    assert history[0].operating_margin == 0.32


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


def test_workbench_monte_carlo_rejects_non_positive_sales_to_capital_samples() -> None:
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
            sales_to_capital=0.2,
            wacc=0.09,
            g_stable=0.02,
            wacc_stable=0.08,
        ),
        bull=ScenarioAssumptions(
            revenue_growth=0.10,
            ebit_margin=0.24,
            tax_rate=0.22,
            sales_to_capital=0.4,
            wacc=0.08,
            g_stable=0.025,
            wacc_stable=0.075,
        ),
        bear=ScenarioAssumptions(
            revenue_growth=0.05,
            ebit_margin=0.16,
            tax_rate=0.28,
            sales_to_capital=-0.1,
            wacc=0.10,
            g_stable=0.015,
            wacc_stable=0.085,
        ),
        monte_carlo=MonteCarloSpec(runs=250, seed=123, bins=25),
    )

    with pytest.raises(ValueError, match=r"sales[_-]to[_-]capital"):
        run_workbench(request)


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


def test_workbench_uses_active_scenario_for_sensitivity_and_kpis() -> None:
    request = WorkbenchRequest(
        scenario="bull",
        base_year=2024,
        periods=3,
        revenue_t0=100.0,
        cash=10.0,
        debt=20.0,
        shares_outstanding=10.0,
        base=ScenarioAssumptions(
            revenue_growth=0.05,
            ebit_margin=0.10,
            tax_rate=0.25,
            sales_to_capital=2.0,
            wacc=0.11,
            g_stable=0.02,
            wacc_stable=0.09,
        ),
        bull=ScenarioAssumptions(
            revenue_growth=0.15,
            ebit_margin=0.30,
            tax_rate=0.20,
            sales_to_capital=2.5,
            wacc=0.08,
            g_stable=0.03,
            wacc_stable=0.075,
        ),
        bear=ScenarioAssumptions(
            revenue_growth=0.02,
            ebit_margin=0.08,
            tax_rate=0.28,
            sales_to_capital=1.5,
            wacc=0.13,
            g_stable=0.015,
            wacc_stable=0.095,
        ),
    )

    response = run_workbench(request)
    ebit_margin = next(kpi for kpi in response.kpis.kpis if kpi.key == "ebit_margin")

    assert ebit_margin.value == 0.30
    assert response.sensitivity.values[0][0] > response.base.valuation.fair_value_per_share
