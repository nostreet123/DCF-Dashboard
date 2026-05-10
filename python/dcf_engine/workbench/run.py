from __future__ import annotations

from dcf_engine.engine import DCFEngine
from dcf_engine.schema import InputAssumptions, Trace
from dcf_engine.workbench.build_inputs import apply_offsets, build_inputs
from dcf_engine.workbench.kpis import build_kpi_summary
from dcf_engine.workbench.monte_carlo import run_monte_carlo
from dcf_engine.workbench.schema import (
    ScenarioAssumptions,
    ScenarioResult,
    SensitivityResult,
    SensitivitySpec,
    WorkbenchRequest,
    WorkbenchResponse,
)


def _run_scenario(
    engine: DCFEngine,
    label: str,
    request: WorkbenchRequest,
    assumptions: ScenarioAssumptions,
) -> tuple[ScenarioResult, InputAssumptions, Trace]:
    inputs = build_inputs(request, assumptions)
    valuation, trace = engine.run(inputs)
    scenario = ScenarioResult(
        label=label,
        assumptions=assumptions,
        valuation=valuation,
        trace=trace if request.include_trace else None,
    )
    return scenario, inputs, trace


def _build_sensitivity(
    engine: DCFEngine,
    inputs: InputAssumptions,
    spec: SensitivitySpec,
) -> SensitivityResult:
    values: list[list[float]] = []
    for wacc_offset in spec.wacc_offsets:
        row: list[float] = []
        for growth_offset in spec.growth_offsets:
            adjusted = apply_offsets(inputs, growth_offset, wacc_offset)
            valuation, _ = engine.run(adjusted)
            row.append(valuation.fair_value_per_share)
        values.append(row)
    return SensitivityResult(
        growth_offsets=spec.growth_offsets,
        wacc_offsets=spec.wacc_offsets,
        values=values,
    )


def run_workbench(request: WorkbenchRequest) -> WorkbenchResponse:
    engine = DCFEngine()
    base, base_inputs, base_trace = _run_scenario(
        engine,
        label="base",
        request=request,
        assumptions=request.base,
    )
    bull, bull_inputs, bull_trace = _run_scenario(
        engine,
        label="bull",
        request=request,
        assumptions=request.bull,
    )
    bear, bear_inputs, bear_trace = _run_scenario(
        engine,
        label="bear",
        request=request,
        assumptions=request.bear,
    )

    scenario_inputs = {
        "base": base_inputs,
        "bull": bull_inputs,
        "bear": bear_inputs,
    }[request.scenario]
    scenario_trace = {
        "base": base_trace,
        "bull": bull_trace,
        "bear": bear_trace,
    }[request.scenario]
    sensitivity_spec = request.sensitivity or SensitivitySpec()
    sensitivity = _build_sensitivity(engine, scenario_inputs, sensitivity_spec)
    kpis = build_kpi_summary(scenario_inputs, scenario_trace, request.statements)
    monte_carlo = None
    if request.monte_carlo is not None:
        monte_carlo = run_monte_carlo(engine, request, request.monte_carlo)

    return WorkbenchResponse(
        base=base,
        bull=bull,
        bear=bear,
        sensitivity=sensitivity,
        kpis=kpis,
        monte_carlo=monte_carlo,
    )
