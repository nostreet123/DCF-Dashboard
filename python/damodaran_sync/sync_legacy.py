from __future__ import annotations

import hashlib
import re
import tempfile
import threading
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from damodaran_sync import download, excel_parse, transform

_SYNC_CACHE: dict[str, str] = {}
_SYNC_CACHE_LOCK = threading.Lock()


def _resolve_dataset_key(file_name: str, sync_info: dict[str, Any] | None) -> str:
    if not sync_info:
        return "unknown"
    mappings = sync_info.get("datasetMappings") or []
    for mapping in mappings:
        pattern = mapping.get("pattern")
        dataset_key = mapping.get("datasetKey")
        if not pattern or not dataset_key:
            continue
        if mapping.get("isRegex"):
            try:
                if re.search(pattern, file_name, re.IGNORECASE):
                    return str(dataset_key)
            except re.error:
                continue
        else:
            if str(pattern).lower() in file_name:
                return str(dataset_key)
    datasets = sync_info.get("datasets") or []
    for dataset in datasets:
        key = dataset.get("key")
        if key:
            return str(key)
    return "unknown"


def _resolve_region_code(file_name: str, sync_info: dict[str, Any] | None) -> str:
    if not sync_info:
        return "unknown"
    regions = sync_info.get("regions") or []
    for region in regions:
        tokens = region.get("fileTokens") or []
        for token in tokens:
            if token and str(token).lower() in file_name:
                code = region.get("code")
                if code:
                    return str(code)
    for region in regions:
        code = region.get("code")
        if code == "us":
            return "us"
    return "unknown"


def sync_dataset_at_url(
    asset_url: str,
    sync_client: Any | None = None,
    *,
    force: bool = False,
    cleanup: bool = True,
    batch_size: int = 100,
) -> bool:
    if sync_client is None:
        raise ValueError("sync_client is required for sync_dataset_at_url")

    total_start = time.time()
    sync_log_id: str | None = None
    sync_info: dict[str, Any] | None = None

    def _finish(status: str) -> None:
        if sync_log_id and hasattr(sync_client, "finish_sync"):
            duration_ms = (time.time() - total_start) * 1000
            sync_client.finish_sync(sync_log_id, status, duration_ms)

    try:
        if hasattr(sync_client, "start_sync"):
            info = sync_client.start_sync(asset_url)
            if isinstance(info, dict):
                sync_info = info
                sync_log_id = info.get("syncLogId")

        with _SYNC_CACHE_LOCK:
            cached_hash = _SYNC_CACHE.get(asset_url)
        if not force and cached_hash is not None:
            _finish("cached")
            return True

        file_name = Path(urlparse(asset_url).path).name or "dataset.xls"
        dataset_key = _resolve_dataset_key(file_name.lower(), sync_info)
        region_code = _resolve_region_code(file_name.lower(), sync_info)

        with tempfile.TemporaryDirectory(prefix="damodaran_sync_") as temp_dir:
            download_path = Path(temp_dir) / file_name
            downloader = download.Downloader()
            download_result = downloader.download(asset_url, download_path)
            file_path = download_path

            asset_hash = None
            if download_result is not None and hasattr(download_result, "sha256"):
                asset_hash = getattr(download_result, "sha256")
            if asset_hash is None:
                asset_hash = hashlib.md5(asset_url.encode("utf-8")).hexdigest()

            parser = excel_parse.ExcelParser()
            try:
                parsed = parser.parse(str(file_path))
            except Exception as exc:
                if sync_log_id and hasattr(sync_client, "add_sync_error"):
                    sync_client.add_sync_error(
                        sync_log_id,
                        "excel_parse",
                        str(exc),
                        {"asset_url": asset_url},
                    )
                _finish("failed")
                return False

            transformed = transform.transform_table(parsed)

            snapshot_id = None
            if hasattr(sync_client, "create_snapshot"):
                snapshot_id = sync_client.create_snapshot(
                    sync_log_id,
                    asset_url,
                    dataset_key,
                    region_code,
                    "unknown",
                    asset_hash,
                    transformed,
                )

            if snapshot_id is not None and hasattr(sync_client, "insert_rows"):
                sync_client.insert_rows(snapshot_id, transformed.rows, batch_size=batch_size)

            if cleanup and hasattr(sync_client, "cleanup_nonactive_tabledata"):
                sync_client.cleanup_nonactive_tabledata()

        with _SYNC_CACHE_LOCK:
            _SYNC_CACHE[asset_url] = asset_hash
        _finish("success")
        return True
    except Exception as exc:
        if sync_log_id and hasattr(sync_client, "add_sync_error"):
            sync_client.add_sync_error(
                sync_log_id,
                "sync",
                str(exc),
                {"asset_url": asset_url},
            )
        _finish("failed")
        return False
