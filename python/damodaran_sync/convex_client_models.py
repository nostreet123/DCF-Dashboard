from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SnapshotUpsertResult:
    snapshot_id: str
    action: str
    previous_build_id: str | None
