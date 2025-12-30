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
        return isinstance(exc, (requests.RequestException, TimeoutError, OSError))

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
        # Reference data is intentionally unauthenticated.
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

    def create_sync_log(self, sync_type: str, page_last_updated: str | None = None) -> str:
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

    def increment_sync_log(self, sync_log_id: str, delta: dict[str, int]) -> None:
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

    def append_sync_error(self, sync_log_id: str, file: str, stage: str, error: str) -> None:
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

    def upsert_snapshot(
        self,
        dataset_key: str,
        region_code: str,
        as_of_date: str,
        build_id: str,
        metadata: dict[str, Any],
    ) -> SnapshotUpsertResult:
        result = self._mutation(
            "snapshots:upsertByIdentity",
            {
                "datasetKey": dataset_key,
                "regionCode": region_code,
                "asOfDate": as_of_date,
                "buildId": build_id,
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
        if not isinstance(deleted, int):
            self._log_invalid_response("tableData:deleteBySnapshotBuild", result)
            raise ValueError(
                f"Unexpected tableData:deleteBySnapshotBuild response: {result!r}"
            )
        return deleted
