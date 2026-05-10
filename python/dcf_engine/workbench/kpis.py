from __future__ import annotations

from dataclasses import dataclass

from dcf_engine.schema import InputAssumptions, Trace
from dcf_engine.workbench.schema import (
    KpiDirection,
    KpiHistoryPoint,
    KpiSummary,
    KpiValue,
    StatementInput,
)


@dataclass(frozen=True)
class KpiDefinition:
    key: str
    label: str
    direction: KpiDirection
    min_value: float
    max_value: float
    unit: str | None = None


KPI_DEFINITIONS = [
    KpiDefinition(
        key="revenue_cagr",
        label="Revenue CAGR",
        direction="higher",
        min_value=0.0,
        max_value=0.2,
        unit="%",
    ),
    KpiDefinition(
        key="ebit_margin",
        label="EBIT Margin",
        direction="higher",
        min_value=0.0,
        max_value=0.3,
        unit="%",
    ),
    KpiDefinition(
        key="wacc",
        label="WACC",
        direction="lower",
        min_value=0.05,
        max_value=0.15,
        unit="%",
    ),
    KpiDefinition(
        key="sales_to_capital",
        label="Sales to Capital",
        direction="higher",
        min_value=0.5,
        max_value=3.0,
        unit=None,
    ),
]


def _score_value(
    value: float | None,
    min_value: float,
    max_value: float,
    direction: KpiDirection,
) -> float | None:
    if value is None:
        return None
    if max_value <= min_value:
        return 0.0
    ratio = (value - min_value) / (max_value - min_value)
    if direction == "lower":
        ratio = 1.0 - ratio
    ratio = max(0.0, min(1.0, ratio))
    return ratio * 100.0


def _safe_average(values: list[float] | None) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def _revenue_cagr(inputs: InputAssumptions, trace: Trace) -> float | None:
    if not trace.forecast.revenue:
        return None
    if inputs.revenue_t0 <= 0:
        return None
    final_revenue = trace.forecast.revenue[-1]
    if final_revenue <= 0:
        return None
    periods = inputs.periods
    if periods <= 0:
        return None
    return (final_revenue / inputs.revenue_t0) ** (1.0 / periods) - 1.0


def build_kpi_summary(
    inputs: InputAssumptions,
    trace: Trace,
    statements: list[StatementInput] | None = None,
) -> KpiSummary:
    values = {
        "revenue_cagr": _revenue_cagr(inputs, trace),
        "ebit_margin": _safe_average(inputs.ebit_margin),
        "wacc": _safe_average(inputs.wacc),
        "sales_to_capital": _safe_average(inputs.sales_to_capital),
    }

    kpis: list[KpiValue] = []
    for definition in KPI_DEFINITIONS:
        value = values.get(definition.key)
        score = _score_value(
            value,
            definition.min_value,
            definition.max_value,
            definition.direction,
        )
        kpis.append(
            KpiValue(
                key=definition.key,
                label=definition.label,
                value=value,
                score=score,
                direction=definition.direction,
                unit=definition.unit,
            )
        )

    history = build_kpi_history(statements)
    return KpiSummary(kpis=kpis, history=history)


def build_kpi_history(
    statements: list[StatementInput] | None,
) -> list[KpiHistoryPoint]:
    if not statements:
        return []
    ordered = sorted(statements, key=lambda item: item.period_end, reverse=True)
    return [
        KpiHistoryPoint(
            period_end=statement.period_end,
            revenue=statement.revenue,
            operating_income=statement.operating_income,
            operating_margin=(
                statement.operating_margin
                if statement.operating_margin is not None
                else statement.operating_income / statement.revenue
                if statement.operating_income is not None and statement.revenue
                else None
            ),
            cash=statement.cash,
            debt=statement.debt,
            shares_outstanding=statement.shares_outstanding,
        )
        for statement in ordered[:5]
    ]
