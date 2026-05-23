from __future__ import annotations

import hashlib
import re
import tempfile
import threading
import time
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from damodaran_sync import download, excel_parse, transform
from damodaran_sync.convex_client import ConvexSyncClient
from damodaran_sync.sync_batching import (
    _insert_rows_resilient,
    _iter_tabledata_batches,
)
from damodaran_sync.sync_options import get_insert_batch_limits
from damodaran_sync.sync_timing import maybe_time

_SYNC_CACHE: dict[str, str] = {}
_SYNC_CACHE_LOCK = threading.Lock()


def parse_downloaded_asset(
    download_res: download.DownloadResult,
    timing: Any | None,
) -> tuple[excel_parse.ParsedTable, int]:
    with maybe_time(timing, "parse_excel"):
        parsed = excel_parse.parse_excel(download_res.path)
    parsed_at = int(time.time() * 1000)
    return parsed, parsed_at


def transform_parsed_asset(
    parsed: excel_parse.ParsedTable,
    timing: Any | None,
) -> transform.TransformResult:
    with maybe_time(timing, "transform"):
        return transform.transform_table(parsed)


def build_snapshot_metadata(
    *,
    asset: Any,
    dataset_key: str,
    datasets_map: dict[str, Any],
    download_res: download.DownloadResult,
    parsed: excel_parse.ParsedTable,
    transformed: transform.TransformResult,
    downloaded_at: int,
    parsed_at: int,
) -> dict[str, Any]:
    dataset_def = datasets_map.get(dataset_key.lower())
    data_type = dataset_def.get("dataType", "other") if dataset_def else "other"

    metadata: dict[str, Any] = {
        "asOfDateSource": asset.as_of_date_source,
        "asOfGranularity": asset.as_of_granularity,
        "sourcePageUrl": asset.source_page_url,
        "sourceUrl": asset.source_url,
        "fileName": asset.file_name,
        "linkLabel": asset.link_label,
        "pageType": asset.page_type,
        "fileHash": download_res.sha256,
        "storageType": transformed.storage_type,
        "sheetName": parsed.sheet_name,
        "headerRow": parsed.header_row,
        "columnNames": parsed.column_names,
        "metricsKeys": transformed.metrics_keys,
        "rowCount": transformed.row_count,
        "dataType": data_type,
        "sheetCandidates": parsed.sheet_candidates,
        "skippedSheets": parsed.skipped_sheets,
        "downloadedAt": downloaded_at,
        "parsedAt": parsed_at,
        "primaryKeyNormComplete": True,
    }
    if download_res.etag is not None:
        metadata["sourceEtag"] = download_res.etag
    if download_res.last_modified is not None:
        metadata["sourceLastModified"] = download_res.last_modified
    if asset.page_last_updated is not None:
        metadata["pageLastUpdated"] = asset.page_last_updated
    if transformed.external_row_count is not None:
        metadata["externalRowCount"] = transformed.external_row_count
    if transformed.external_byte_size is not None:
        metadata["externalByteSize"] = transformed.external_byte_size
    if transformed.sample_strategy is not None:
        metadata["sampleStrategy"] = transformed.sample_strategy
    if transformed.sample_row_count is not None:
        metadata["sampleRowCount"] = transformed.sample_row_count
    return metadata


def upload_asset_rows(
    client: ConvexSyncClient,
    *,
    dataset_key: str,
    region_code: str,
    as_of_date: str,
    metadata: dict[str, Any],
    transformed: transform.TransformResult,
    force_rebuild: bool,
    timing: Any | None,
) -> tuple[bool, int]:
    build_id = uuid.uuid4().hex
    with maybe_time(timing, "upsert_snapshot"):
        upsert_res = client.upsert_snapshot(
            dataset_key,
            region_code,
            as_of_date,
            build_id,
            metadata,
            force_rebuild=force_rebuild,
        )

    if upsert_res.action == "unchanged" and not force_rebuild:
        return False, 0

    total_inserted = 0
    rows_to_insert = transformed.rows
    max_batch_rows, max_batch_bytes = get_insert_batch_limits()
    with maybe_time(timing, "insert_rows_total"):
        for batch_payloads in _iter_tabledata_batches(
            rows_to_insert,
            max_rows=max_batch_rows,
            max_bytes=max_batch_bytes,
        ):
            inserted, _ = _insert_rows_resilient(
                client,
                upsert_res.snapshot_id,
                build_id,
                batch_payloads,
            )
            total_inserted += inserted

    if upsert_res.action in ("created", "updated"):
        with maybe_time(timing, "finalize_snapshot"):
            client.finalize_snapshot(upsert_res.snapshot_id, build_id, metadata)

    if upsert_res.previous_build_id:
        with maybe_time(timing, "delete_previous_build_rows"):
            while True:
                deleted = client.delete_rows(
                    upsert_res.snapshot_id,
                    upsert_res.previous_build_id,
                    1000,
                )
                if deleted == 0:
                    break

    return True, total_inserted


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
        elif str(pattern).lower() in file_name:
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
    """Deprecated single-asset sync kept for performance regression tests."""
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
