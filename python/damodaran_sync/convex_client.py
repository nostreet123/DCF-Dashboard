from __future__ import annotations

from dataclasses import dataclass
import logging
import os
import time
from typing import Any, Callable

import requests
from convex import ConvexClient

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SnapshotUpsertResult:
    snapshot_id: str
    action: str
    previous_build_id: str | None


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
        result = self._query("seed:getReference", {}, include_token=False)
        if not isinstance(result, dict):
            self._log_invalid_response("seed:getReference", result)
            raise ValueError(f"Unexpected seed:getReference response: {result!r}")
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
        result = self._query(
            "snapshots:getByIdentity",
            {
                "datasetKey": dataset_key,
                "regionCode": region_code,
                "asOfDate": as_of_date,
            },
            include_token=False,
        )
        if result is None:
            return None
        if not isinstance(result, dict):
            self._log_invalid_response("snapshots:getByIdentity", result)
            raise ValueError(
                f"Unexpected snapshots:getByIdentity response: {result!r}"
            )
        return result

    def get_snapshot_by_id(self, snapshot_id: str) -> dict[str, Any] | None:
        result = self._query(
            "snapshots:getById",
            {
                "snapshotId": snapshot_id,
            },
            include_token=False,
        )
        if result is None:
            return None
        if not isinstance(result, dict):
            self._log_invalid_response("snapshots:getById", result)
            raise ValueError(f"Unexpected snapshots:getById response: {result!r}")
        return result

    def get_snapshots_by_identity_batch(
        self, identities: list[dict[str, str]]
    ) -> list[dict[str, Any]]:
        if not identities:
            return []
        result = self._query(
            "snapshots:getByIdentityBatch",
            {
                "identities": identities,
            },
            include_token=False,
        )
        if not isinstance(result, list):
            self._log_invalid_response("snapshots:getByIdentityBatch", result)
            raise ValueError(
                f"Unexpected snapshots:getByIdentityBatch response: {result!r}"
            )
        return result

    def get_latest_manifest(self, page_type: str) -> dict[str, Any] | None:
        result = self._query(
            "syncManifests:getLatest",
            {
                "pageType": page_type,
            },
            include_token=True,
        )
        if result is None:
            return None
        if not isinstance(result, dict):
            self._log_invalid_response("syncManifests:getLatest", result)
            raise ValueError(
                f"Unexpected syncManifests:getLatest response: {result!r}"
            )
        return result

    def upsert_manifest(
        self, page_type: str, manifest_hash: str, source: str, item_count: int
    ) -> str:
        result = self._mutation(
            "syncManifests:upsert",
            {
                "pageType": page_type,
                "manifestHash": manifest_hash,
                "source": source,
                "itemCount": item_count,
            },
        )
        if not isinstance(result, str):
            self._log_invalid_response("syncManifests:upsert", result)
            raise ValueError(f"Unexpected syncManifests:upsert response: {result!r}")
        return result


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
        result = self._mutation("syncLogs:create", payload)
        if not isinstance(result, str):
            self._log_invalid_response("syncLogs:create", result)
            raise ValueError(f"Unexpected syncLogs:create response: {result!r}")
        return result

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

        if not isinstance(result, dict):
            self._log_invalid_response("snapshots:upsertByIdentity", result)
            raise ValueError(
                f"Unexpected snapshots:upsertByIdentity response: {result!r}"
            )
        snapshot_id = result.get("snapshotId")
        action = result.get("action")
        if not isinstance(snapshot_id, str) or not isinstance(action, str):
            self._log_invalid_response("snapshots:upsertByIdentity", result)
            raise ValueError(
                f"Unexpected snapshots:upsertByIdentity response: {result!r}"
            )
        return SnapshotUpsertResult(
            snapshot_id=snapshot_id,
            action=action,
            previous_build_id=result.get("previousBuildId"),
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
        if not isinstance(result, dict):
            self._log_invalid_response("tableData:insertBatch", result)
            raise ValueError(f"Unexpected tableData:insertBatch response: {result!r}")
        inserted = result.get("inserted", 0)
        if isinstance(inserted, float):
            if not inserted.is_integer():
                self._log_invalid_response("tableData:insertBatch", result)
                raise ValueError(f"Unexpected tableData:insertBatch response: {result!r}")
            inserted = int(inserted)
        if not isinstance(inserted, int):
            self._log_invalid_response("tableData:insertBatch", result)
            raise ValueError(f"Unexpected tableData:insertBatch response: {result!r}")
        return inserted

    def delete_rows(self, snapshot_id: str, build_id: str, limit: int) -> int:
        result = self._mutation(
            "tableData:deleteBySnapshotBuild",
            {
                "snapshotId": snapshot_id,
                "buildId": build_id,
                "limit": limit,
            },
        )
        if not isinstance(result, dict):
            self._log_invalid_response("tableData:deleteBySnapshotBuild", result)
            raise ValueError(
                f"Unexpected tableData:deleteBySnapshotBuild response: {result!r}"
            )
        deleted = result.get("deleted", 0)
        if isinstance(deleted, float):
            if not deleted.is_integer():
                self._log_invalid_response("tableData:deleteBySnapshotBuild", result)
                raise ValueError(
                    f"Unexpected tableData:deleteBySnapshotBuild response: {result!r}"
                )
            deleted = int(deleted)
        if not isinstance(deleted, int):
            self._log_invalid_response("tableData:deleteBySnapshotBuild", result)
            raise ValueError(
                f"Unexpected tableData:deleteBySnapshotBuild response: {result!r}"
            )
        return deleted

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
        if not isinstance(result, dict):
            self._log_invalid_response("tableData:deleteNonActiveRowsPage", result)
            raise ValueError(
                f"Unexpected tableData:deleteNonActiveRowsPage response: {result!r}"
            )
        deleted = result.get("deleted", 0)
        if isinstance(deleted, float):
            if not deleted.is_integer():
                self._log_invalid_response("tableData:deleteNonActiveRowsPage", result)
                raise ValueError(
                    f"Unexpected tableData:deleteNonActiveRowsPage response: {result!r}"
                )
            deleted = int(deleted)
        if not isinstance(deleted, int):
            self._log_invalid_response("tableData:deleteNonActiveRowsPage", result)
            raise ValueError(
                f"Unexpected tableData:deleteNonActiveRowsPage response: {result!r}"
            )
        next_cursor = result.get("nextCursor")
        if next_cursor is not None and not isinstance(next_cursor, str):
            self._log_invalid_response("tableData:deleteNonActiveRowsPage", result)
            raise ValueError(
                f"Unexpected tableData:deleteNonActiveRowsPage response: {result!r}"
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
        if not isinstance(result, dict):
            self._log_invalid_response("tableData:backfillPrimaryKeyNormPage", result)
            raise ValueError(
                "Unexpected tableData:backfillPrimaryKeyNormPage response: "
                f"{result!r}"
            )
        updated = result.get("updated", 0)
        if isinstance(updated, float):
            if not updated.is_integer():
                self._log_invalid_response(
                    "tableData:backfillPrimaryKeyNormPage", result
                )
                raise ValueError(
                    "Unexpected tableData:backfillPrimaryKeyNormPage response: "
                    f"{result!r}"
                )
            updated = int(updated)
        if not isinstance(updated, int):
            self._log_invalid_response("tableData:backfillPrimaryKeyNormPage", result)
            raise ValueError(
                "Unexpected tableData:backfillPrimaryKeyNormPage response: "
                f"{result!r}"
            )
        next_cursor = result.get("nextCursor")
        if next_cursor is not None and not isinstance(next_cursor, str):
            self._log_invalid_response("tableData:backfillPrimaryKeyNormPage", result)
            raise ValueError(
                "Unexpected tableData:backfillPrimaryKeyNormPage response: "
                f"{result!r}"
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
        if not isinstance(result, dict):
            self._log_invalid_response(
                "tableData:backfillMissingPrimaryKeyNormPage", result
            )
            raise ValueError(
                "Unexpected tableData:backfillMissingPrimaryKeyNormPage response: "
                f"{result!r}"
            )
        updated = result.get("updated", 0)
        if isinstance(updated, float):
            if not updated.is_integer():
                self._log_invalid_response(
                    "tableData:backfillMissingPrimaryKeyNormPage", result
                )
                raise ValueError(
                    "Unexpected tableData:backfillMissingPrimaryKeyNormPage response: "
                    f"{result!r}"
                )
            updated = int(updated)
        if not isinstance(updated, int):
            self._log_invalid_response(
                "tableData:backfillMissingPrimaryKeyNormPage", result
            )
            raise ValueError(
                "Unexpected tableData:backfillMissingPrimaryKeyNormPage response: "
                f"{result!r}"
            )
        next_cursor = result.get("nextCursor")
        if next_cursor is not None and not isinstance(next_cursor, str):
            self._log_invalid_response(
                "tableData:backfillMissingPrimaryKeyNormPage", result
            )
            raise ValueError(
                "Unexpected tableData:backfillMissingPrimaryKeyNormPage response: "
                f"{result!r}"
            )
        seen_snapshots = result.get("seenSnapshots", [])
        if not isinstance(seen_snapshots, list):
            self._log_invalid_response(
                "tableData:backfillMissingPrimaryKeyNormPage", result
            )
            raise ValueError(
                "Unexpected tableData:backfillMissingPrimaryKeyNormPage response: "
                f"{result!r}"
            )
        parsed_seen: list[tuple[str, str]] = []
        for entry in seen_snapshots:
            if not isinstance(entry, dict):
                self._log_invalid_response(
                    "tableData:backfillMissingPrimaryKeyNormPage", result
                )
                raise ValueError(
                    "Unexpected tableData:backfillMissingPrimaryKeyNormPage response: "
                    f"{result!r}"
                )
            snapshot_id = entry.get("snapshotId")
            build_id = entry.get("buildId")
            if not isinstance(snapshot_id, str) or not isinstance(build_id, str):
                self._log_invalid_response(
                    "tableData:backfillMissingPrimaryKeyNormPage", result
                )
                raise ValueError(
                    "Unexpected tableData:backfillMissingPrimaryKeyNormPage response: "
                    f"{result!r}"
                )
            parsed_seen.append((snapshot_id, build_id))
        return updated, next_cursor, parsed_seen
