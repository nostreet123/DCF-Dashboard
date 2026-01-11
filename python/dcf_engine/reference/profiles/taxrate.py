from __future__ import annotations

from dcf_engine.reference.profiles.base import MetricResolution, _first_numeric, _first_numeric_any
from dcf_engine.reference.provider import RowRef


DATASET_KEY = "taxrate"
CANDIDATE_COLUMNS = [
    "Effective tax rate",
    "Tax rate",
    "Average tax rate",
]


def resolve_tax_rate(row: RowRef) -> MetricResolution | None:
    resolved = _first_numeric(row, CANDIDATE_COLUMNS)
    if resolved is not None:
        return resolved
    return _first_numeric_any(row)
