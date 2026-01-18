from __future__ import annotations

from dcf_engine.reference.profiles.base import MetricResolution, _first_numeric
from dcf_engine.reference.provider import RowRef


DATASET_KEY = "betas"
CANDIDATE_COLUMNS = [
    "Beta",
    "Unlevered beta",
    "Levered beta",
]


def resolve_beta(row: RowRef) -> MetricResolution | None:
    return _first_numeric(row, CANDIDATE_COLUMNS)
