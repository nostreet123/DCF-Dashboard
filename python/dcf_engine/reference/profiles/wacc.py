from __future__ import annotations

from dcf_engine.reference.profiles.base import (
    MetricResolution,
    _first_numeric_any_filtered,
    _first_numeric_normalized,
)
from dcf_engine.reference.provider import RowRef


DATASET_KEY = "wacc"
CANDIDATE_COLUMNS = [
    "Cost of Capital",
    "WACC",
    "Weighted Average Cost of Capital",
]
_PREFERRED_KEYWORDS = ["wacc", "cost of capital", "weighted average cost of capital"]
_EXCLUDE_KEYWORDS = ["number of", "num", "count", "firms", "firm", "#"]


def _normalize_percent(resolved: MetricResolution) -> MetricResolution:
    if 1 < resolved.value <= 100:
        return MetricResolution(resolved.value / 100, resolved.column)
    return resolved


def resolve_wacc(row: RowRef) -> MetricResolution | None:
    resolved = _first_numeric_normalized(row, CANDIDATE_COLUMNS)
    if resolved is not None:
        return _normalize_percent(resolved)
    resolved = _first_numeric_any_filtered(
        row, prefer_keywords=_PREFERRED_KEYWORDS, exclude_keywords=_EXCLUDE_KEYWORDS
    )
    return _normalize_percent(resolved) if resolved is not None else None
