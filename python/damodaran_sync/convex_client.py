from __future__ import annotations

import logging
import os
from typing import Any

from damodaran_sync.convex_client_models import SnapshotUpsertResult
from damodaran_sync.convex_client_validation import (
    expect_dict,
    expect_int_field,
    expect_list,
    expect_optional_dict,
    expect_optional_str_field,
    expect_str,
    parse_seen_snapshots,
)
from dcf_engine.convex_transport import ConvexTransport

logger = logging.getLogger(__name__)


class ConvexSyncClient:
    def __init__(self, convex_url: str | None = None, sync_token: str | None = None) -> None:
        resolved_url = convex_url or os.getenv("CONVEX_URL")
        if not resolved_url:
            raise ValueError("CONVEX_URL is required")
        self._sync_token = sync_token or os.getenv("DAMODARAN_SYNC_TOKEN")
        self._transport = ConvexTransport(
            resolved_url,
            sync_token=self._sync_token,
        )

    def clone(self) -> "ConvexSyncClient":
        cloned = ConvexSyncClient(self._transport.convex_url, self._sync_token)
        return cloned

    def _log_invalid_response(self, operation: str, result: Any) -> None:
        logger.error("Unexpected %s response: %r", operation, result)

    def _query(
        self,
        name: str,
        args: dict[str, Any] | None = None,
        *,
        include_token: bool = True,
    ) -> Any:
        return self._transport.query(name, args, include_token=include_token)

    def _mutation(self, name: str, args: dict[str, Any] | None = None) -> Any:
        return self._transport.mutation(name, args, include_token=True)

    def upsert_seed(self) -> None:
        self._mutation("seed:upsertAll", {})

    def get_reference(self) -> dict[str, Any]:
        result = expect_dict(
            "seed:getReference",
            self._query("seed:getReference", {}, include_token=False),
            self._log_invalid_response,
        )
        for key in ("regions", "datasets", "datasetMappings"):
            value = result.get(key)
            if not isinstance(value, list):
                self._log_invalid_response("seed:getReference", result)
                raise ValueError(
                    f"Unexpected seed:getReference response for {key}: {result!r}"
                )
        return result

    def get_snapshot_by_identity(
        self, dataset_key: str, region_code: str, as_of_date: str
    ) -> dict[str, Any] | None:
        return expect_optional_dict(
            "snapshots:getByIdentity",
            self._query(
                "snapshots:getByIdentity",
                {
                    "datasetKey": dataset_key,
                    "regionCode": region_code,
                    "asOfDate": as_of_date,
                },
                include_token=False,
            ),
            self._log_invalid_response,
        )

    def get_snapshot_by_id(self, snapshot_id: str) -> dict[str, Any] | None:
        return expect_optional_dict(
            "snapshots:getById",
            self._query(
                "snapshots:getById",
                {
                    "snapshotId": snapshot_id,
                },
                include_token=False,
            ),
            self._log_invalid_response,
        )

    def get_snapshots_by_identity_batch(
        self, identities: list[dict[str, str]]
    ) -> list[dict[str, Any]]:
        if not identities:
            return []
        result = expect_list(
            "snapshots:getByIdentityBatch",
            self._query(
                "snapshots:getByIdentityBatch",
                {
                    "identities": identities,
                },
                include_token=False,
            ),
            self._log_invalid_response,
        )
        return result

    def get_latest_manifest(self, page_type: str) -> dict[str, Any] | None:
        return expect_optional_dict(
            "syncManifests:getLatest",
            self._query(
                "syncManifests:getLatest",
                {
                    "pageType": page_type,
                },
                include_token=True,
            ),
            self._log_invalid_response,
        )

    def upsert_manifest(
        self, page_type: str, manifest_hash: str, source: str, item_count: int
    ) -> str:
        return expect_str(
            "syncManifests:upsert",
            self._mutation(
                "syncManifests:upsert",
                {
                    "pageType": page_type,
                    "manifestHash": manifest_hash,
                    "source": source,
                    "itemCount": item_count,
                },
            ),
            self._log_invalid_response,
        )

    def create_sync_log(
        self,
        sync_type: str,
        page_last_updated: str | None = None,
    ) -> str:
        payload: dict[str, Any] = {
            "syncType": sync_type,
        }
        if page_last_updated is not None:
            payload["pageLastUpdated"] = page_last_updated
        return expect_str(
            "syncLogs:create",
            self._mutation("syncLogs:create", payload),
            self._log_invalid_response,
        )

    def increment_sync_log(
        self,
        sync_log_id: str,
        delta: dict[str, int],
    ) -> None:
        self._mutation(
            "syncLogs:increment",
            {
                "syncLogId": sync_log_id,
                "delta": delta,
            },
        )

    def finish_sync_log(self, sync_log_id: str, status: str) -> None:
        self._mutation(
            "syncLogs:finish",
            {
                "syncLogId": sync_log_id,
                "status": status,
            },
        )

    def append_sync_error(
        self,
        sync_log_id: str,
        file: str,
        stage: str,
        error: str,
    ) -> None:
        self._mutation(
            "syncErrors:append",
            {
                "syncLogId": sync_log_id,
                "file": file,
                "stage": stage,
                "error": error,
            },
        )

    def record_asset(self, asset: dict[str, Any]) -> None:
        self._mutation(
            "assets:record",
            {
                "asset": asset,
            },
        )

    def record_assets_batch(self, assets: list[dict[str, Any]], chunk_size: int = 1000) -> None:
        if not assets:
            return
        if chunk_size <= 0:
            chunk_size = len(assets)
        for start in range(0, len(assets), chunk_size):
            self._mutation(
                "assets:recordBatch",
                {
                    "assets": assets[start : start + chunk_size],
                },
            )

    def upsert_snapshot(
        self,
        dataset_key: str,
        region_code: str,
        as_of_date: str,
        build_id: str,
        metadata: dict[str, Any],
        *,
        force_rebuild: bool = False,
    ) -> SnapshotUpsertResult:
        result = self._mutation(
            "snapshots:upsertByIdentity",
            {
                "datasetKey": dataset_key,
                "regionCode": region_code,
                "asOfDate": as_of_date,
                "buildId": build_id,
                "forceRebuild": force_rebuild,
                "metadata": metadata,
            },
        )

        parsed = expect_dict(
            "snapshots:upsertByIdentity",
            result,
            self._log_invalid_response,
        )
        snapshot_id = parsed.get("snapshotId")
        action = parsed.get("action")
        if not isinstance(snapshot_id, str) or not isinstance(action, str):
            self._log_invalid_response("snapshots:upsertByIdentity", parsed)
            raise ValueError(
                f"Unexpected snapshots:upsertByIdentity response: {parsed!r}"
            )
        return SnapshotUpsertResult(
            snapshot_id=snapshot_id,
            action=action,
            previous_build_id=parsed.get("previousBuildId"),
        )

    def finalize_snapshot(self, snapshot_id: str, build_id: str, metadata: dict[str, Any]) -> None:
        self._mutation(
            "snapshots:finalizeRebuild",
            {
                "snapshotId": snapshot_id,
                "buildId": build_id,
                "metadata": metadata,
            },
        )

    def mark_primary_key_norm_complete(self, snapshot_id: str, build_id: str) -> None:
        self._mutation(
            "snapshots:markPrimaryKeyNormComplete",
            {
                "snapshotId": snapshot_id,
                "buildId": build_id,
            },
        )

    def insert_rows(self, snapshot_id: str, build_id: str, rows: list[dict[str, Any]]) -> int:
        result = self._mutation(
            "tableData:insertBatch",
            {
                "snapshotId": snapshot_id,
                "buildId": build_id,
                "rows": rows,
            },
        )
        parsed = expect_dict("tableData:insertBatch", result, self._log_invalid_response)
        return expect_int_field(
            "tableData:insertBatch",
            parsed,
            "inserted",
            self._log_invalid_response,
        )

    def delete_rows(self, snapshot_id: str, build_id: str, limit: int) -> int:
        result = self._mutation(
            "tableData:deleteBySnapshotBuild",
            {
                "snapshotId": snapshot_id,
                "buildId": build_id,
                "limit": limit,
            },
        )
        parsed = expect_dict(
            "tableData:deleteBySnapshotBuild", result, self._log_invalid_response
        )
        return expect_int_field(
            "tableData:deleteBySnapshotBuild",
            parsed,
            "deleted",
            self._log_invalid_response,
        )

    def delete_non_active_rows_page(
        self,
        snapshot_id: str,
        active_build_id: str,
        cursor: str | None = None,
        limit: int = 500,
    ) -> tuple[int, str | None]:
        result = self._mutation(
            "tableData:deleteNonActiveRowsPage",
            {
                "snapshotId": snapshot_id,
                "activeBuildId": active_build_id,
                **({"cursor": cursor} if cursor is not None else {}),
                "limit": limit,
            },
        )
        parsed = expect_dict(
            "tableData:deleteNonActiveRowsPage", result, self._log_invalid_response
        )
        deleted = expect_int_field(
            "tableData:deleteNonActiveRowsPage",
            parsed,
            "deleted",
            self._log_invalid_response,
        )
        next_cursor = expect_optional_str_field(
            "tableData:deleteNonActiveRowsPage",
            parsed,
            "nextCursor",
            self._log_invalid_response,
        )
        return deleted, next_cursor

    def backfill_primary_key_norm_page(
        self,
        snapshot_id: str,
        build_id: str,
        cursor: str | None = None,
        limit: int = 500,
    ) -> tuple[int, str | None]:
        result = self._mutation(
            "tableData:backfillPrimaryKeyNormPage",
            {
                "snapshotId": snapshot_id,
                "buildId": build_id,
                **({"cursor": cursor} if cursor is not None else {}),
                "limit": limit,
            },
        )
        parsed = expect_dict(
            "tableData:backfillPrimaryKeyNormPage", result, self._log_invalid_response
        )
        updated = expect_int_field(
            "tableData:backfillPrimaryKeyNormPage",
            parsed,
            "updated",
            self._log_invalid_response,
        )
        next_cursor = expect_optional_str_field(
            "tableData:backfillPrimaryKeyNormPage",
            parsed,
            "nextCursor",
            self._log_invalid_response,
        )
        return updated, next_cursor

    def backfill_missing_primary_key_norm_page(
        self,
        cursor: str | None = None,
        limit: int = 500,
    ) -> tuple[int, str | None, list[tuple[str, str]]]:
        result = self._mutation(
            "tableData:backfillMissingPrimaryKeyNormPage",
            {
                **({"cursor": cursor} if cursor is not None else {}),
                "limit": limit,
            },
        )
        parsed = expect_dict(
            "tableData:backfillMissingPrimaryKeyNormPage",
            result,
            self._log_invalid_response,
        )
        updated = expect_int_field(
            "tableData:backfillMissingPrimaryKeyNormPage",
            parsed,
            "updated",
            self._log_invalid_response,
        )
        next_cursor = expect_optional_str_field(
            "tableData:backfillMissingPrimaryKeyNormPage",
            parsed,
            "nextCursor",
            self._log_invalid_response,
        )
        parsed_seen = parse_seen_snapshots(
            "tableData:backfillMissingPrimaryKeyNormPage",
            parsed,
            self._log_invalid_response,
        )
        return updated, next_cursor, parsed_seen
