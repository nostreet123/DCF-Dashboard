from __future__ import annotations

import logging
import os
import time
from typing import Any, Callable

import requests
from convex import ConvexClient

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

logger = logging.getLogger(__name__)


class ConvexSyncClient:
    _MAX_ATTEMPTS = 3
    _BACKOFF_BASE_SECONDS = 0.5
    _BACKOFF_MAX_SECONDS = 4.0

    def __init__(self, convex_url: str | None = None, sync_token: str | None = None) -> None:
        self._convex_url = convex_url or os.getenv("CONVEX_URL")
        if not self._convex_url:
            raise ValueError("CONVEX_URL is required")
        self._sync_token = sync_token or os.getenv("DAMODARAN_SYNC_TOKEN")
        self._client = ConvexClient(self._convex_url)

    def clone(self) -> "ConvexSyncClient":
        return ConvexSyncClient(self._convex_url, self._sync_token)

    def _token_arg(self) -> dict[str, Any]:
        return {"syncToken": self._sync_token} if self._sync_token is not None else {}

    def _sanitize_args(self, args: dict[str, Any] | None) -> dict[str, Any] | None:
        if args is None:
            return None
        sanitized: dict[str, Any] = {}
        for key, value in args.items():
            if key == "syncToken":
                sanitized[key] = "***"
            elif isinstance(value, list):
                sanitized[key] = f"<{len(value)} items>"
            else:
                sanitized[key] = value
        return sanitized

    def _is_transient_error(self, exc: Exception) -> bool:
        if isinstance(exc, (TimeoutError, OSError)):
            return True
        if isinstance(exc, requests.RequestException):
            resp = getattr(exc, "response", None)
            if resp is not None:
                return resp.status_code == 429 or resp.status_code >= 500
            return True
        return False

    def _execute(
        self,
        operation: str,
        args: dict[str, Any] | None,
        func: Callable[[], Any],
    ) -> Any:
        attempt = 0
        while True:
            try:
                return func()
            except Exception as exc:
                attempt += 1
                if self._is_transient_error(exc) and attempt < self._MAX_ATTEMPTS:
                    delay = min(
                        self._BACKOFF_BASE_SECONDS * (2 ** (attempt - 1)),
                        self._BACKOFF_MAX_SECONDS,
                    )
                    logger.warning(
                        "Transient Convex error during %s (attempt %s/%s); retrying in %.1fs.",
                        operation,
                        attempt,
                        self._MAX_ATTEMPTS,
                        delay,
                        exc_info=exc,
                    )
                    time.sleep(delay)
                    continue
                sanitized = self._sanitize_args(args)
                logger.error(
                    "Convex %s failed with args=%s",
                    operation,
                    sanitized,
                    exc_info=exc,
                )
                raise RuntimeError(
                    f"Convex {operation} failed with args {sanitized}"
                ) from exc

    def _query(
        self,
        name: str,
        args: dict[str, Any] | None = None,
        *,
        include_token: bool = True,
    ) -> Any:
        payload = dict(args or {})
        if include_token:
            payload.update(self._token_arg())
        return self._execute(
            f"query {name}",
            payload,
            lambda: self._client.query(name, payload),
        )

    def _mutation(self, name: str, args: dict[str, Any] | None = None) -> Any:
        payload = dict(args or {})
        payload.update(self._token_arg())
        return self._execute(
            f"mutation {name}",
            payload,
            lambda: self._client.mutation(name, payload),
        )

    def _log_invalid_response(self, operation: str, result: Any) -> None:
        logger.error("Unexpected %s response: %r", operation, result)

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
