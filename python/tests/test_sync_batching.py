from __future__ import annotations

from typing import Any

from damodaran_sync.sync_batching import _insert_rows_resilient, _iter_tabledata_batches
from damodaran_sync.transform import NormalizedRow


def test_iter_tabledata_batches_respects_row_limit() -> None:
    rows = [
        NormalizedRow(
            row_index=i,
            primary_key=f"key_{i}",
            primary_key_norm=f"key {i}",
            secondary_key=None,
            metrics={"value": float(i)},
        )
        for i in range(3)
    ]

    batches = list(_iter_tabledata_batches(rows, max_rows=2, max_bytes=1_000_000))

    assert len(batches) == 2
    assert len(batches[0]) == 2
    assert len(batches[1]) == 1


def test_insert_rows_resilient_splits_on_large_batch_error() -> None:
    class _Client:
        def __init__(self) -> None:
            self.calls = 0

        def insert_rows(self, snapshot_id: str, build_id: str, rows: list[dict[str, Any]]) -> int:
            self.calls += 1
            if len(rows) > 1:
                raise RuntimeError("Batch too large: payload")
            return len(rows)

    client = _Client()
    rows = [{"rowIndex": i, "primaryKey": f"key_{i}", "metrics": {"value": i}} for i in range(4)]

    inserted, calls = _insert_rows_resilient(client, "snapshot-1", "build-1", rows)

    assert inserted == 4
    assert calls >= 4
    assert client.calls >= 4
