from __future__ import annotations

from dataclasses import dataclass
import os
from typing import Any

from convex import ConvexClient


@dataclass(frozen=True)
class SnapshotUpsertResult:
    snapshot_id: str
    action: str
    previous_build_id: str | None


class ConvexSyncClient:
    def __init__(self, convex_url: str | None = None, sync_token: str | None = None) -> None:
        self._convex_url = convex_url or os.getenv("CONVEX_URL")
        if not self._convex_url:
            raise ValueError("CONVEX_URL is required")
        self._sync_token = sync_token or os.getenv("DAMODARAN_SYNC_TOKEN")
        self._client = ConvexClient(self._convex_url)

    def _token_arg(self) -> dict[str, Any]:
        return {"syncToken": self._sync_token} if self._sync_token is not None else {}

    def upsert_seed(self) -> None:
        self._client.mutation("seed:upsertAll", {**self._token_arg()})

    def get_reference(self) -> dict[str, Any]:
        return self._client.query("seed:getReference")

    def create_sync_log(self, sync_type: str, page_last_updated: str | None = None) -> str:
        payload: dict[str, Any] = {
            **self._token_arg(),
            "syncType": sync_type,
        }
        if page_last_updated is not None:
            payload["pageLastUpdated"] = page_last_updated
        return self._client.mutation("syncLogs:create", payload)

    def increment_sync_log(self, sync_log_id: str, delta: dict[str, int]) -> None:
        self._client.mutation(
            "syncLogs:increment",
            {
                **self._token_arg(),
                "syncLogId": sync_log_id,
                "delta": delta,
            },
        )

    def finish_sync_log(self, sync_log_id: str, status: str) -> None:
        self._client.mutation(
            "syncLogs:finish",
            {
                **self._token_arg(),
                "syncLogId": sync_log_id,
                "status": status,
            },
        )

    def append_sync_error(self, sync_log_id: str, file: str, stage: str, error: str) -> None:
        self._client.mutation(
            "syncErrors:append",
            {
                **self._token_arg(),
                "syncLogId": sync_log_id,
                "file": file,
                "stage": stage,
                "error": error,
            },
        )

    def record_asset(self, asset: dict[str, Any]) -> None:
        self._client.mutation(
            "assets:record",
            {
                **self._token_arg(),
                "asset": asset,
            },
        )

    def upsert_snapshot(
        self,
        dataset_key: str,
        region_code: str,
        as_of_date: str,
        build_id: str,
        metadata: dict[str, Any],
    ) -> SnapshotUpsertResult:
        result = self._client.mutation(
            "snapshots:upsertByIdentity",
            {
                **self._token_arg(),
                "datasetKey": dataset_key,
                "regionCode": region_code,
                "asOfDate": as_of_date,
                "buildId": build_id,
                "metadata": metadata,
            },
        )

        return SnapshotUpsertResult(
            snapshot_id=result["snapshotId"],
            action=result["action"],
            previous_build_id=result.get("previousBuildId"),
        )

    def finalize_snapshot(self, snapshot_id: str, build_id: str, metadata: dict[str, Any]) -> None:
        self._client.mutation(
            "snapshots:finalizeRebuild",
            {
                **self._token_arg(),
                "snapshotId": snapshot_id,
                "buildId": build_id,
                "metadata": metadata,
            },
        )

    def insert_rows(self, snapshot_id: str, build_id: str, rows: list[dict[str, Any]]) -> int:
        result = self._client.mutation(
            "tableData:insertBatch",
            {
                **self._token_arg(),
                "snapshotId": snapshot_id,
                "buildId": build_id,
                "rows": rows,
            },
        )
        return result.get("inserted", 0)

    def delete_rows(self, snapshot_id: str, build_id: str, limit: int) -> int:
        result = self._client.mutation(
            "tableData:deleteBySnapshotBuild",
            {
                **self._token_arg(),
                "snapshotId": snapshot_id,
                "buildId": build_id,
                "limit": limit,
            },
        )
        return result.get("deleted", 0)
