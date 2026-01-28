from __future__ import annotations

import os
from typing import Any

from convex import ConvexClient

from dcf_engine.reference.provider import ReferenceProvider, RowRef, SnapshotRef


class ConvexReferenceProvider(ReferenceProvider):
    def __init__(self, convex_url: str | None = None) -> None:
        self._convex_url = convex_url or os.getenv("CONVEX_URL")
        if not self._convex_url:
            raise ValueError("CONVEX_URL is required")
        self._sync_token = os.getenv("DAMODARAN_SYNC_TOKEN")
        if not self._sync_token:
            raise ValueError("DAMODARAN_SYNC_TOKEN is required")
        self._client = ConvexClient(self._convex_url)

    def _token_arg(self) -> dict[str, Any]:
        return {"syncToken": self._sync_token}

    def _snapshot_from_payload(self, payload: dict[str, Any]) -> SnapshotRef:
        return SnapshotRef(
            snapshot_id=payload["snapshotId"],
            dataset_key=payload["datasetKey"],
            region_code=payload["regionCode"],
            as_of_date=payload["asOfDate"],
            active_build_id=payload["activeBuildId"],
            column_names=payload.get("columnNames", []),
            metrics_keys=payload.get("metricsKeys", []),
        )

    def get_latest_snapshot(self, dataset_key: str, region_code: str) -> SnapshotRef | None:
        result = self._client.query(
            "reference:getLatestSnapshot",
            {
                "datasetKey": dataset_key,
                "regionCode": region_code,
                **self._token_arg(),
            },
        )
        if result is None:
            return None
        return self._snapshot_from_payload(result)

    def get_snapshot_at_or_before(
        self, dataset_key: str, region_code: str, target_date: str
    ) -> SnapshotRef | None:
        result = self._client.query(
            "reference:getSnapshotAtOrBefore",
            {
                "datasetKey": dataset_key,
                "regionCode": region_code,
                "targetDate": target_date,
                **self._token_arg(),
            },
        )
        if result is None:
            return None
        return self._snapshot_from_payload(result)

    def get_row(
        self,
        dataset_key: str,
        region_code: str,
        as_of_date: str | None,
        primary_key_norm: str,
        secondary_key: str | None = None,
    ) -> RowRef | None:
        payload = {
            "datasetKey": dataset_key,
            "regionCode": region_code,
            "primaryKeyNorm": primary_key_norm,
            **self._token_arg(),
        }
        if as_of_date is not None:
            payload["asOfDate"] = as_of_date
        if secondary_key is not None:
            payload["secondaryKey"] = secondary_key
        result = self._client.query("reference:getRow", payload)
        if result is None:
            return None
        snapshot = self._snapshot_from_payload(result["snapshot"])
        row = result["row"]
        return RowRef(
            snapshot=snapshot,
            primary_key_norm=row["primaryKeyNorm"],
            secondary_key=row.get("secondaryKey"),
            metrics=row["metrics"],
        )
