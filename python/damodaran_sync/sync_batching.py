from __future__ import annotations

import json
from typing import Any, Iterable

from damodaran_sync import transform
from damodaran_sync.convex_client import ConvexSyncClient


def _estimate_payload_bytes(payload: dict[str, Any]) -> int:
    return len(
        json.dumps(payload, default=str, separators=(",", ":"), ensure_ascii=True).encode(
            "utf-8"
        )
    )


def _iter_tabledata_batches(
    rows: list[transform.NormalizedRow],
    max_rows: int,
    max_bytes: int,
) -> Iterable[list[dict[str, Any]]]:
    batch: list[dict[str, Any]] = []
    batch_bytes = 2

    for row in rows:
        payload: dict[str, Any] = {
            "rowIndex": row.row_index,
            "primaryKey": row.primary_key,
            "primaryKeyNorm": row.primary_key_norm,
            "metrics": row.metrics,
        }
        if row.secondary_key is not None:
            payload["secondaryKey"] = row.secondary_key

        payload_bytes = _estimate_payload_bytes(payload)
        projected = (2 + payload_bytes) if not batch else (batch_bytes + 1 + payload_bytes)

        if batch and (len(batch) >= max_rows or projected > max_bytes):
            yield batch
            batch = []
            batch_bytes = 2
            projected = 2 + payload_bytes

        batch.append(payload)
        batch_bytes = projected

    if batch:
        yield batch


def _contains_any(haystack: str, needles: list[str]) -> bool:
    return any(needle in haystack for needle in needles)


def _is_batch_too_large_error(exc: BaseException) -> bool:
    cursor: BaseException | None = exc
    needles = [
        "Batch too large",
        "Function argument size",
        "Data written",
        "payload",
        "too large",
    ]
    while cursor is not None:
        message = str(cursor)
        if _contains_any(message, needles):
            return True
        cursor = cursor.__cause__ or cursor.__context__
    return False


def _insert_rows_resilient(
    client: ConvexSyncClient,
    snapshot_id: str,
    build_id: str,
    rows: list[dict[str, Any]],
) -> tuple[int, int]:
    try:
        return client.insert_rows(snapshot_id, build_id, rows), 1
    except Exception as exc:
        if len(rows) <= 1 or not _is_batch_too_large_error(exc):
            raise
        mid = len(rows) // 2
        left_inserted, left_calls = _insert_rows_resilient(
            client, snapshot_id, build_id, rows[:mid]
        )
        right_inserted, right_calls = _insert_rows_resilient(
            client, snapshot_id, build_id, rows[mid:]
        )
        return left_inserted + right_inserted, left_calls + right_calls
