from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class SnapshotRef:
    snapshot_id: str
    dataset_key: str
    region_code: str
    as_of_date: str
    active_build_id: str
    column_names: list[str]
    metrics_keys: list[str]


@dataclass(frozen=True)
class RowRef:
    snapshot: SnapshotRef
    primary_key_norm: str
    secondary_key: str | None
    metrics: dict[str, object]


class ReferenceProvider(Protocol):
    def get_latest_snapshot(self, dataset_key: str, region_code: str) -> SnapshotRef | None:
        ...

    def get_snapshot_at_or_before(
        self, dataset_key: str, region_code: str, target_date: str
    ) -> SnapshotRef | None:
        ...

    def get_row(
        self,
        dataset_key: str,
        region_code: str,
        as_of_date: str | None,
        primary_key_norm: str,
        secondary_key: str | None = None,
    ) -> RowRef | None:
        ...
