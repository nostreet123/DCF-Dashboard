from __future__ import annotations

from dcf_engine import convex_transport
from dcf_engine.persist import convex_runs
from dcf_engine.schema import (
    BridgeTable,
    DiscountingTable,
    ForecastSchedule,
    ForecastTable,
    InputAssumptions,
    NormalizedAssumptions,
    Trace,
    ValuationResult,
)


class DummyConvexClient:
    last_instance = None

    def __init__(self, url: str) -> None:
        self.url = url
        self.mutations: list[tuple[str, dict]] = []
        DummyConvexClient.last_instance = self

    def mutation(self, name: str, args: dict):
        self.mutations.append((name, args))
        return {"runId": "run1", "traceId": "trace1"}


def _build_trace() -> Trace:
    schedule = ForecastSchedule(t=[1, 2], years=[2025, 2026])
    forecast = ForecastTable(
        t=[1, 2],
        years=[2025, 2026],
        revenue=[100.0, 110.0],
        revenue_growth=[0.1, 0.1],
        ebit_margin=[0.2, 0.2],
        ebit=[20.0, 22.0],
        tax_rate=[0.25, 0.25],
        nopat=[15.0, 16.5],
        sales_to_capital=[2.0, 2.0],
        reinvestment=[50.0, 55.0],
        fcff=[-35.0, -38.5],
    )
    discounting = DiscountingTable(
        t=[1, 2],
        years=[2025, 2026],
        wacc=[0.1, 0.1],
        discount_factor=[0.909, 0.826],
        pv_fcff=[-31.8, -31.8],
        terminal_value=500.0,
        pv_terminal=413.0,
    )
    bridge = BridgeTable(
        firm_value=349.4,
        cash=10.0,
        other_non_operating_assets=0.0,
        debt=50.0,
        equity_value=309.4,
        equity_value_adjusted=None,
        shares_outstanding=10.0,
        value_per_share=30.94,
        fair_value_per_share=30.94,
    )
    return Trace(schedule=schedule, forecast=forecast, discounting=discounting, bridge=bridge)


def _build_inputs() -> InputAssumptions:
    return InputAssumptions(
        base_year=2024,
        currency="USD",
        periods=2,
        revenue_t0=100.0,
        revenue_growth=[0.1, 0.1],
        ebit_margin=[0.2, 0.2],
        tax_rate=[0.25, 0.25],
        sales_to_capital=[2.0, 2.0],
        reinvestment_lag_years=0,
        wacc=[0.1, 0.1],
        g_stable=0.02,
        wacc_stable=0.08,
        cash=10.0,
        debt=50.0,
        other_non_operating_assets=0.0,
        shares_outstanding=10.0,
        failure_probability=None,
        distress_recovery_fraction=None,
    )


def _build_normalized() -> NormalizedAssumptions:
    inputs = _build_inputs()
    return NormalizedAssumptions(
        base_year=inputs.base_year,
        periods=inputs.periods,
        currency=inputs.currency,
        revenue_t0=inputs.revenue_t0,
        revenue_growth=inputs.revenue_growth,
        ebit_margin=inputs.ebit_margin or [],
        tax_rate=inputs.tax_rate or [],
        sales_to_capital=inputs.sales_to_capital or [],
        reinvestment_lag_years=inputs.reinvestment_lag_years,
        wacc=inputs.wacc or [],
        g_stable=inputs.g_stable,
        wacc_stable=inputs.wacc_stable,
        cash=inputs.cash,
        debt=inputs.debt,
        other_non_operating_assets=inputs.other_non_operating_assets,
        shares_outstanding=inputs.shares_outstanding,
        failure_probability=inputs.failure_probability,
        distress_recovery_fraction=inputs.distress_recovery_fraction,
    )


def _build_result() -> ValuationResult:
    return ValuationResult(
        firm_value=349.4,
        pv_fcff=-63.6,
        terminal_value=500.0,
        pv_terminal=413.0,
        equity_value=309.4,
        equity_value_adjusted=None,
        value_per_share=30.94,
        fair_value_per_share=30.94,
    )


def test_convex_run_persister_inline(monkeypatch):
    monkeypatch.setattr(convex_transport, "ConvexClient", DummyConvexClient)
    monkeypatch.setattr(convex_runs, "MAX_TRACE_BYTES", 10_000)
    monkeypatch.setenv("DAMODARAN_SYNC_TOKEN", "test-token")

    persister = convex_runs.ConvexRunPersister(convex_url="http://example")
    run = persister.save(
        inputs=_build_inputs(),
        normalized=_build_normalized(),
        provenance=None,
        result=_build_result(),
        trace=_build_trace(),
        primary_key_norm="software entertainment",
        region_code="us",
        as_of_date="2026-01-09",
        include_trace=True,
    )

    assert run["runId"] == "run1"
    assert DummyConvexClient.last_instance is not None
    name, args = DummyConvexClient.last_instance.mutations[0]
    assert name == "valuations:create"
    assert args["traceStorage"] == "inline"
    assert args["trace"] is not None
    assert args["traceByteSize"] is not None


def test_convex_run_persister_external(monkeypatch):
    monkeypatch.setattr(convex_transport, "ConvexClient", DummyConvexClient)
    monkeypatch.setattr(convex_runs, "MAX_TRACE_BYTES", 1)
    monkeypatch.setenv("DAMODARAN_SYNC_TOKEN", "test-token")

    persister = convex_runs.ConvexRunPersister(convex_url="http://example")
    persister.save(
        inputs=_build_inputs(),
        normalized=_build_normalized(),
        provenance=None,
        result=_build_result(),
        trace=_build_trace(),
        primary_key_norm=None,
        region_code=None,
        as_of_date=None,
        include_trace=True,
    )

    name, args = DummyConvexClient.last_instance.mutations[-1]
    assert name == "valuations:create"
    assert args["traceStorage"] == "external"
    assert args["trace"] is not None


def test_convex_run_persister_without_trace(monkeypatch):
    monkeypatch.setattr(convex_transport, "ConvexClient", DummyConvexClient)
    monkeypatch.setenv("DAMODARAN_SYNC_TOKEN", "test-token")

    persister = convex_runs.ConvexRunPersister(convex_url="http://example")
    persister.save(
        inputs=_build_inputs(),
        normalized=None,
        provenance=None,
        result=None,
        trace=None,
        primary_key_norm=None,
        region_code=None,
        as_of_date=None,
        include_trace=False,
    )

    name, args = DummyConvexClient.last_instance.mutations[-1]
    assert name == "valuations:create"
    assert args["traceStorage"] == "none"
    assert "trace" not in args
    assert "normalizedInputs" not in args
    assert "resultSummary" not in args
