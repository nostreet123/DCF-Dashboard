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


def _normalize_header(header: str) -> str:
    lowered = header.lower()
    normalized = "".join(ch if ch.isalnum() else " " for ch in lowered)
    return " ".join(normalized.split())


def _first_numeric_normalized(
    row: RowRef, candidates: Iterable[str]
) -> MetricResolution | None:
    normalized_map: dict[str, str] = {}
    for key in row.metrics.keys():
        normalized = _normalize_header(key)
        if normalized and normalized not in normalized_map:
            normalized_map[normalized] = key

    for candidate in candidates:
        normalized = _normalize_header(candidate)
        if normalized not in normalized_map:
            continue
        original_key = normalized_map[normalized]
        value = row.metrics[original_key]
        if isinstance(value, (int, float)):
            return MetricResolution(float(value), original_key)
    return None


def _first_numeric_any(row: RowRef) -> MetricResolution | None:
    for key, value in row.metrics.items():
        if isinstance(value, (int, float)):
            return MetricResolution(float(value), key)
    return None


def _first_numeric_any_filtered(
    row: RowRef,
    prefer_keywords: Iterable[str],
    exclude_keywords: Iterable[str],
) -> MetricResolution | None:
    preferred: MetricResolution | None = None
    preferred_score = 0
    fallback: MetricResolution | None = None

    for key, value in row.metrics.items():
        if not isinstance(value, (int, float)):
            continue
        normalized = _normalize_header(key)
        if any(keyword in normalized for keyword in exclude_keywords):
            continue
        resolution = MetricResolution(float(value), key)
        if fallback is None:
            fallback = resolution
        score = sum(1 for keyword in prefer_keywords if keyword in normalized)
        if score > preferred_score:
            preferred = resolution
            preferred_score = score

    return preferred if preferred is not None else fallback
