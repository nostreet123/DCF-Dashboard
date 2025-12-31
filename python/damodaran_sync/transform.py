from __future__ import annotations

from dataclasses import dataclass
import json
import math
import re
from typing import Iterable

from damodaran_sync.excel_parse import ParsedTable

MAX_ROW_COUNT = 50_000
MAX_TOTAL_BYTES = 5_000_000
MAX_ROW_BYTES = 30_000
SAMPLE_ROW_LIMIT = 200

DIMENSION_HEADERS = {
    "country",
    "region",
    "rating",
    "year",
    "date",
    "period",
    "currency",
}

METRIC_HEADER_KEYWORDS = {
    "number of firms",
    "number of firm",
    "%",
    "percent",
    "percentage",
}


@dataclass(frozen=True)
class NormalizedRow:
    row_index: int
    primary_key: str
    secondary_key: str | None
    metrics: dict[str, object]


@dataclass(frozen=True)
class TransformResult:
    rows: list[NormalizedRow]
    row_count: int
    approx_bytes: int
    max_row_bytes: int
    storage_type: str
    external_row_count: int | None
    external_byte_size: int | None
    sample_strategy: str | None
    sample_row_count: int | None
    metrics_keys: list[str]


def _is_empty(value: object) -> bool:
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    return False


def _is_numeric(value: object) -> bool:
    if _is_empty(value):
        return False
    if isinstance(value, (int, float)):
        return True
    if isinstance(value, str):
        stripped = value.strip().replace(",", "")
        return bool(re.match(r"^-?\d+(?:\.\d+)?$", stripped))
    return False


def _is_date_like(value: object) -> bool:
    if not isinstance(value, str):
        return False
    stripped = value.strip()
    if re.match(r"^\d{4}(-\d{2})?(-\d{2})?$", stripped):
        return True
    if re.match(r"^\d{1,2}/\d{2,4}$", stripped):
        return True
    if re.match(r"^[A-Za-z]+\s+\d{4}$", stripped):
        return True
    return False


def _header_is_metric(header: str) -> bool:
    normalized = header.strip().lower()
    tokens = re.findall(r"[a-z0-9%]+", normalized)
    if "n" in tokens or "count" in tokens:
        return True
    for keyword in METRIC_HEADER_KEYWORDS:
        if keyword in normalized:
            return True
    return False


def _header_is_dimension(header: str) -> bool:
    normalized = header.strip().lower()
    if normalized in DIMENSION_HEADERS:
        return True
    return False


def _should_use_secondary(header: str, values: Iterable[object]) -> bool:
    if _header_is_metric(header):
        return False

    total = 0
    numeric_count = 0
    unique_values: set[str] = set()

    for value in values:
        if _is_empty(value):
            continue
        total += 1
        if _is_numeric(value):
            numeric_count += 1
        unique_values.add(str(value).strip())

    if total == 0:
        return False

    non_numeric = total - numeric_count
    dimension_ratio = non_numeric / total
    unique_ratio = len(unique_values) / total if total else 1.0

    if _header_is_dimension(header):
        return dimension_ratio >= 0.6

    return dimension_ratio >= 0.8 and unique_ratio <= 0.5


def _row_payload(row: NormalizedRow) -> dict[str, object]:
    return {
        "primaryKey": row.primary_key,
        "secondaryKey": row.secondary_key,
        "metrics": row.metrics,
    }


def _compute_size(rows: list[NormalizedRow]) -> tuple[int, int]:
    serialized = [
        json.dumps(_row_payload(row), default=str).encode("utf-8")
        for row in rows
    ]
    approx_bytes = sum(len(row) for row in serialized) + 2 + max(0, len(serialized) - 1)
    max_row_bytes = max((len(row) for row in serialized), default=0)
    return approx_bytes, max_row_bytes


def _decide_storage(row_count: int, approx_bytes: int, max_row_bytes: int) -> bool:
    return (
        row_count <= MAX_ROW_COUNT
        and approx_bytes <= MAX_TOTAL_BYTES
        and max_row_bytes <= MAX_ROW_BYTES
    )


def transform_table(parsed: ParsedTable) -> TransformResult:
    rows: list[NormalizedRow] = []

    if not parsed.column_names:
        return TransformResult(
            rows=[],
            row_count=0,
            approx_bytes=0,
            max_row_bytes=0,
            storage_type="convex",
            external_row_count=None,
            external_byte_size=None,
            sample_strategy=None,
            sample_row_count=None,
            metrics_keys=[],
        )

    secondary_header = parsed.column_names[1] if len(parsed.column_names) > 1 else None
    second_column_values = [row[1] for row in parsed.rows if len(row) > 1] if secondary_header else []
    use_secondary = bool(secondary_header) and _should_use_secondary(secondary_header, second_column_values)

    metric_start_index = 2 if use_secondary else 1
    metrics_keys = parsed.column_names[metric_start_index:]

    for index, row in enumerate(parsed.rows):
        if not row:
            continue
        primary_value = row[0] if len(row) > 0 else None
        if _is_empty(primary_value):
            continue
        primary_key = str(primary_value).strip()
        secondary_key = None
        if use_secondary and len(row) > 1 and not _is_empty(row[1]):
            secondary_key = str(row[1]).strip()

        metrics: dict[str, object] = {}
        for col_index, col_name in enumerate(parsed.column_names[metric_start_index:], start=metric_start_index):
            value = row[col_index] if col_index < len(row) else None
            metrics[col_name] = value

        rows.append(
            NormalizedRow(
                row_index=index,
                primary_key=primary_key,
                secondary_key=secondary_key,
                metrics=metrics,
            )
        )

    row_count = len(rows)
    approx_bytes, max_row_bytes = _compute_size(rows)
    fits_convex = _decide_storage(row_count, approx_bytes, max_row_bytes)

    if fits_convex:
        return TransformResult(
            rows=rows,
            row_count=row_count,
            approx_bytes=approx_bytes,
            max_row_bytes=max_row_bytes,
            storage_type="convex",
            external_row_count=None,
            external_byte_size=None,
            sample_strategy=None,
            sample_row_count=None,
            metrics_keys=metrics_keys,
        )

    sample_rows = rows[: min(SAMPLE_ROW_LIMIT, len(rows))]
    return TransformResult(
        rows=sample_rows,
        row_count=row_count,
        approx_bytes=approx_bytes,
        max_row_bytes=max_row_bytes,
        storage_type="external",
        external_row_count=row_count,
        external_byte_size=approx_bytes,
        sample_strategy="head",
        sample_row_count=len(sample_rows),
        metrics_keys=metrics_keys,
    )
