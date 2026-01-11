from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from dcf_engine.reference.provider import RowRef


@dataclass(frozen=True)
class MetricResolution:
    value: float
    column: str


def _first_numeric(row: RowRef, candidates: Iterable[str]) -> MetricResolution | None:
    for candidate in candidates:
        if candidate not in row.metrics:
            continue
        value = row.metrics[candidate]
        if isinstance(value, (int, float)):
            return MetricResolution(float(value), candidate)
    return None


def _first_numeric_any(row: RowRef) -> MetricResolution | None:
    for key, value in row.metrics.items():
        if isinstance(value, (int, float)):
            return MetricResolution(float(value), key)
    return None
