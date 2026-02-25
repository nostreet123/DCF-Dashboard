from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
import traceback
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any

import requests

from damodaran_sync import discover, download, excel_parse, transform, mapping_resolver, mirror
from damodaran_sync.convex_client import ConvexSyncClient
from damodaran_sync.sync_batching import (
    _insert_rows_resilient,
    _is_batch_too_large_error,
    _iter_tabledata_batches,
)
from damodaran_sync.sync_legacy import (
    _resolve_dataset_key,
    _resolve_region_code,
    sync_dataset_at_url,
)
from damodaran_sync.sync_resolution import (
    ResolvedAsset as _ResolvedAsset,
    _build_asset_record,
    build_resolved_asset,
)

logger = logging.getLogger(__name__)
_MAX_SNAPSHOT_IDENTITY_BATCH = 100
_MAX_ASSET_BATCH = 500


@dataclass
class _TimingSummary:
    stages_ms: dict[str, float] = field(default_factory=dict)
    counters: dict[str, int] = field(default_factory=dict)

    def add_ms(self, stage: str, delta_ms: float) -> None:
        self.stages_ms[stage] = self.stages_ms.get(stage, 0.0) + delta_ms

    def inc(self, counter: str, delta: int = 1) -> None:
        self.counters[counter] = self.counters.get(counter, 0) + delta

    def report(self) -> str:
        total_ms = sum(self.stages_ms.values())
        lines: list[str] = []
        lines.append("Timing summary:")
        if not self.stages_ms:
            lines.append("- (no timings recorded)")
            return "\n".join(lines)

        ordered = sorted(self.stages_ms.items(), key=lambda kv: kv[1], reverse=True)
        for stage, ms in ordered:
            pct = (ms / total_ms * 100.0) if total_ms else 0.0
            lines.append(f"- {stage}: {ms/1000:.2f}s ({pct:.1f}%)")

        if self.counters:
            lines.append("Counters:")
            for key, value in sorted(self.counters.items()):
                lines.append(f"- {key}: {value}")
        return "\n".join(lines)


@contextmanager
def _maybe_time(timing: _TimingSummary | None, stage: str):
    if timing is None:
        yield
        return
    start = time.perf_counter()
    try:
        yield
    finally:
        timing.add_ms(stage, (time.perf_counter() - start) * 1000.0)


@dataclass
class _AssetOutcome:
    success: int = 0
    skipped: int = 0
    error: int = 0
    downloaded: int = 0
    rows_inserted: int = 0


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _asset_key(asset: dict[str, Any]) -> str:
    def _part(value: Any) -> str:
        if value is None:
            return ""
        return str(value)

    return "\x1f".join(
        [
            _part(asset.get("sourcePageUrl")),
            _part(asset.get("pageType")),
            _part(asset.get("pageLastUpdated")),
            _part(asset.get("sourceUrl")),
            _part(asset.get("fileName")),
            _part(asset.get("linkLabel")),
            "1" if asset.get("resolved") else "0",
            _part(asset.get("resolvedDatasetKey")),
            _part(asset.get("resolvedRegionCode")),
            _part(asset.get("resolvedAsOfDate")),
            _part(asset.get("resolvedAsOfDateSource")),
            _part(asset.get("resolutionError")),
        ]
    )


def _chunked(items: list[dict[str, str]], size: int) -> list[list[dict[str, str]]]:
    if size <= 0:
        return [items]
    return [items[i : i + size] for i in range(0, len(items), size)]


def _get_insert_batch_limits() -> tuple[int, int]:
    max_rows = _env_int("DAMODARAN_INSERT_BATCH_MAX_ROWS", 100)
    max_rows = max(1, min(900, max_rows))

    default_bytes = 8 * 1024 * 1024
    max_bytes = _env_int("DAMODARAN_INSERT_BATCH_MAX_BYTES", default_bytes)
    # Convex function arg limit is 16 MiB; keep an upper clamp.
    max_bytes = max(1024, min(16 * 1024 * 1024, max_bytes))
    return max_rows, max_bytes


def _stable_manifest_hash(assets: list[discover.DiscoveredAsset]) -> str:
    manifest_items: list[dict[str, str]] = []
    for asset in assets:
        manifest_items.append(
            {
                "sourcePageUrl": asset.source_page_url,
                "pageType": asset.page_type,
                "pageLastUpdated": asset.page_last_updated or "",
                "sourceUrl": asset.source_url,
                "fileName": asset.file_name,
                "linkLabel": asset.link_label,
                "asOfDate": asset.as_of_date or "",
                "asOfDateSource": asset.as_of_date_source or "",
                "asOfGranularity": asset.as_of_granularity or "",
            }
        )
    # Sort by a total key to ensure deterministic ordering even when multiple
    # assets share the same (sourceUrl, fileName, linkLabel, asOfDate).
    manifest_items.sort(key=lambda item: tuple(item[k] for k in sorted(item.keys())))
    payload = json.dumps(
        manifest_items,
        separators=(",", ":"),
        sort_keys=True,
        ensure_ascii=True,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _is_ready_snapshot(snapshot: dict[str, Any] | None) -> bool:
    return bool(
        snapshot
        and snapshot.get("activeBuildId")
        and snapshot.get("dataStatus") == "ready"
    )


def _resolve_snapshot_for_asset(
    item: _ResolvedAsset,
    client: ConvexSyncClient,
    force_rebuild: bool,
    bulk_failed: bool,
    timing: _TimingSummary | None,
) -> dict[str, Any] | None:
    snapshot = item.snapshot
    if snapshot is None and not force_rebuild and bulk_failed:
        with _maybe_time(timing, "get_snapshot_by_identity"):
            snapshot = client.get_snapshot_by_identity(
                item.dataset_key,
                item.region_code,
                item.asset.as_of_date,
            )
    return snapshot


def _should_skip_before_download(
    asset: discover.DiscoveredAsset,
    snapshot: dict[str, Any] | None,
    *,
    force_rebuild: bool,
    additive_only: bool,
    trust_archive_immutable: bool,
) -> bool:
    if additive_only and _is_ready_snapshot(snapshot):
        return True
    if (
        trust_archive_immutable
        and asset.page_type == "archive"
        and not force_rebuild
        and _is_ready_snapshot(snapshot)
    ):
        return True
    return False


def _resolve_conditional_headers(
    snapshot: dict[str, Any] | None,
    *,
    conditional_get_enabled: bool,
    force_rebuild: bool,
) -> tuple[str | None, str | None]:
    if not (conditional_get_enabled and not force_rebuild and _is_ready_snapshot(snapshot)):
        return None, None

    conditional_etag = snapshot.get("sourceEtag")
    conditional_last_modified = snapshot.get("sourceLastModified")
    if conditional_etag or conditional_last_modified:
        return conditional_etag, conditional_last_modified
    return None, None


def _should_skip_via_head_precheck(
    asset: discover.DiscoveredAsset,
    snapshot: dict[str, Any] | None,
    *,
    force_rebuild: bool,
    head_precheck_enabled: bool,
    conditional_etag: str | None,
    conditional_last_modified: str | None,
    timing: _TimingSummary | None,
) -> bool:
    if (
        not head_precheck_enabled
        or force_rebuild
        or not _is_ready_snapshot(snapshot)
        or not (conditional_etag or conditional_last_modified)
    ):
        return False

    try:
        with _maybe_time(timing, "head_precheck"):
            probe = download.probe_remote(
                asset.source_url,
                etag=conditional_etag,
                last_modified=conditional_last_modified,
            )
    except Exception:
        probe = None
    return bool(probe is not None and probe.not_modified)


def _download_asset_with_404_handling(
    asset: discover.DiscoveredAsset,
    dataset_key: str,
    region_code: str,
    client: ConvexSyncClient,
    *,
    conditional_etag: str | None,
    conditional_last_modified: str | None,
    timing: _TimingSummary | None,
) -> download.DownloadResult | None:
    try:
        with _maybe_time(timing, "download"):
            return download.download_file(
                asset.source_url,
                etag=conditional_etag,
                last_modified=conditional_last_modified,
            )
    except requests.HTTPError as exc:
        response = exc.response
        status_code = response.status_code if response is not None else None
        if status_code == 404:
            client.record_asset(
                _build_asset_record(
                    asset,
                    dataset_key,
                    region_code,
                    "missing_url",
                )
            )
            return None
        raise


def _should_skip_after_download(
    snapshot: dict[str, Any] | None,
    download_res: download.DownloadResult,
    *,
    force_rebuild: bool,
) -> bool:
    return bool(
        not force_rebuild and download_res.not_modified and _is_ready_snapshot(snapshot)
    )


def _should_skip_same_hash(
    snapshot: dict[str, Any] | None,
    download_res: download.DownloadResult,
    *,
    force_rebuild: bool,
) -> bool:
    return bool(
        not force_rebuild
        and _is_ready_snapshot(snapshot)
        and snapshot.get("fileHash") == download_res.sha256
    )


def _run_download_stage(
    item: _ResolvedAsset,
    client: ConvexSyncClient,
    *,
    force_rebuild: bool,
    additive_only: bool,
    conditional_get_enabled: bool,
    head_precheck_enabled: bool,
    bulk_failed: bool,
    trust_archive_immutable: bool,
    timing: _TimingSummary | None,
    outcome: _AssetOutcome,
) -> tuple[download.DownloadResult, int] | None:
    asset = item.asset
    snapshot = _resolve_snapshot_for_asset(
        item,
        client,
        force_rebuild,
        bulk_failed,
        timing,
    )

    if _should_skip_before_download(
        asset,
        snapshot,
        force_rebuild=force_rebuild,
        additive_only=additive_only,
        trust_archive_immutable=trust_archive_immutable,
    ):
        outcome.skipped += 1
        return None

    conditional_etag, conditional_last_modified = _resolve_conditional_headers(
        snapshot,
        conditional_get_enabled=conditional_get_enabled,
        force_rebuild=force_rebuild,
    )
    if _should_skip_via_head_precheck(
        asset,
        snapshot,
        force_rebuild=force_rebuild,
        head_precheck_enabled=head_precheck_enabled,
        conditional_etag=conditional_etag,
        conditional_last_modified=conditional_last_modified,
        timing=timing,
    ):
        outcome.skipped += 1
        return None

    download_res = _download_asset_with_404_handling(
        asset,
        item.dataset_key,
        item.region_code,
        client,
        conditional_etag=conditional_etag,
        conditional_last_modified=conditional_last_modified,
        timing=timing,
    )
    if download_res is None:
        outcome.skipped += 1
        return None

    downloaded_at = int(time.time() * 1000)
    if _should_skip_after_download(
        snapshot,
        download_res,
        force_rebuild=force_rebuild,
    ):
        outcome.skipped += 1
        return None

    outcome.downloaded += 1

    if _should_skip_same_hash(
        snapshot,
        download_res,
        force_rebuild=force_rebuild,
    ):
        outcome.skipped += 1
        return None

    return download_res, downloaded_at


def _parse_downloaded_asset(
    download_res: download.DownloadResult,
    timing: _TimingSummary | None,
) -> tuple[excel_parse.ParsedTable, int]:
    with _maybe_time(timing, "parse_excel"):
        parsed = excel_parse.parse_excel(download_res.path)
    parsed_at = int(time.time() * 1000)
    return parsed, parsed_at


def _transform_parsed_asset(
    parsed: excel_parse.ParsedTable,
    timing: _TimingSummary | None,
) -> transform.TransformResult:
    with _maybe_time(timing, "transform"):
        return transform.transform_table(parsed)


def _build_snapshot_metadata(
    *,
    asset: discover.DiscoveredAsset,
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


def _upload_asset_rows(
    client: ConvexSyncClient,
    *,
    dataset_key: str,
    region_code: str,
    as_of_date: str,
    metadata: dict[str, Any],
    transformed: transform.TransformResult,
    force_rebuild: bool,
    timing: _TimingSummary | None,
) -> tuple[bool, int]:
    build_id = uuid.uuid4().hex
    with _maybe_time(timing, "upsert_snapshot"):
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
    max_batch_rows, max_batch_bytes = _get_insert_batch_limits()
    with _maybe_time(timing, "insert_rows_total"):
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
        with _maybe_time(timing, "finalize_snapshot"):
            client.finalize_snapshot(upsert_res.snapshot_id, build_id, metadata)

    if upsert_res.previous_build_id:
        with _maybe_time(timing, "delete_previous_build_rows"):
            while True:
                deleted = client.delete_rows(
                    upsert_res.snapshot_id,
                    upsert_res.previous_build_id,
                    1000,
                )
                if deleted == 0:
                    break

    return True, total_inserted


def _process_asset(
    item: _ResolvedAsset,
    client: ConvexSyncClient,
    sync_log_id: str,
    datasets_map: dict[str, Any],
    force_rebuild: bool,
    additive_only: bool,
    conditional_get_enabled: bool,
    head_precheck_enabled: bool,
    bulk_failed: bool,
    trust_archive_immutable: bool,
    timing: _TimingSummary | None,
) -> _AssetOutcome:
    asset = item.asset
    dataset_key = item.dataset_key
    region_code = item.region_code
    outcome = _AssetOutcome()

    try:
        stage = "download"
        # 6. Check Validity for Ingestion
        # Skip ONLY if asOfDate is missing.
        if not asset.as_of_date:
            outcome.skipped += 1
            return outcome

        download_stage = _run_download_stage(
            item,
            client,
            force_rebuild=force_rebuild,
            additive_only=additive_only,
            conditional_get_enabled=conditional_get_enabled,
            head_precheck_enabled=head_precheck_enabled,
            bulk_failed=bulk_failed,
            trust_archive_immutable=trust_archive_immutable,
            timing=timing,
            outcome=outcome,
        )
        if download_stage is None:
            return outcome

        download_res, downloaded_at = download_stage
        stage = "parse"
        parsed, parsed_at = _parse_downloaded_asset(download_res, timing)
        stage = "transform"
        transformed = _transform_parsed_asset(parsed, timing)
        stage = "upload"

        metadata = _build_snapshot_metadata(
            asset=asset,
            dataset_key=dataset_key,
            datasets_map=datasets_map,
            download_res=download_res,
            parsed=parsed,
            transformed=transformed,
            downloaded_at=downloaded_at,
            parsed_at=parsed_at,
        )
        uploaded, inserted_rows = _upload_asset_rows(
            client,
            dataset_key=dataset_key,
            region_code=region_code,
            as_of_date=asset.as_of_date,
            metadata=metadata,
            transformed=transformed,
            force_rebuild=force_rebuild,
            timing=timing,
        )
        if not uploaded:
            outcome.skipped += 1
            return outcome

        outcome.rows_inserted += inserted_rows
        outcome.success += 1
        return outcome
    except Exception as e:
        current_stage = locals().get("stage", "pre_download")
        current_dataset = locals().get("dataset_key", "unknown")
        current_region = locals().get("region_code", "unknown")
        client.append_sync_error(
            sync_log_id,
            asset.file_name,
            current_stage,
            f"{type(e).__name__}: {str(e)}",
        )
        logger.error(
            "Error processing %s (dataset=%s, region=%s, url=%s) at stage=%s",
            asset.file_name,
            current_dataset,
            current_region,
            asset.source_url,
            current_stage,
            exc_info=True,
        )
        outcome.error += 1
        return outcome

@dataclass
class _DiscoveryResult:
    assets: list[discover.DiscoveredAsset]
    page_last_updated: str | None
    manifest_hash: str
    manifest_source: str


@dataclass
class _RunCounts:
    success: int = 0
    skipped: int = 0
    error: int = 0
    downloaded: int = 0
    rows_inserted: int = 0


def _discover_assets_for_page(
    page_url: str,
    page_type: str,
    limit_assets: int | None,
    timing: _TimingSummary | None,
) -> _DiscoveryResult:
    assets: list[discover.DiscoveredAsset] = []
    page_last_updated: str | None = None
    manifest_hash: str | None = None
    manifest_source = "live"
    mirror_manifest_url = os.getenv("DAMODARAN_MIRROR_MANIFEST_URL")
    if mirror_manifest_url:
        with _maybe_time(timing, "fetch_manifest"):
            manifest = mirror.fetch_manifest(mirror_manifest_url, page_type)
        assets = manifest.assets
        manifest_hash = manifest.manifest_hash
        manifest_source = manifest.source
        page_last_updated = assets[0].page_last_updated if assets else None
    else:
        with _maybe_time(timing, "discover"):
            discovery = discover.discover_page_assets(page_url, page_type)
        assets = discovery.assets
        page_last_updated = discovery.page_last_updated

    if limit_assets is not None:
        assets = assets[:limit_assets]

    if manifest_hash is None:
        manifest_hash = _stable_manifest_hash(assets)

    return _DiscoveryResult(
        assets=assets,
        page_last_updated=page_last_updated,
        manifest_hash=manifest_hash,
        manifest_source=manifest_source,
    )


def _resolve_assets_for_page(
    assets: list[discover.DiscoveredAsset],
    mappings_list: list[dict[str, Any]],
    datasets_map: dict[str, Any],
    regions_list: list[dict[str, Any]],
    client: ConvexSyncClient,
    timing: _TimingSummary | None,
) -> list[_ResolvedAsset]:
    resolved_assets: list[_ResolvedAsset] = []
    for asset in assets:
        with _maybe_time(timing, "resolve_dataset"):
            stem = mapping_resolver.normalize_stem(asset.file_name)
            dataset_key, resolved_ds = mapping_resolver.resolve_dataset_key(
                stem, mappings_list
            )
        with _maybe_time(timing, "resolve_region"):
            region_code, region_error = mapping_resolver.resolve_region_code(
                stem,
                asset.link_label,
                dataset_key,
                datasets_map,
                regions_list,
            )
        resolved_assets.append(
            build_resolved_asset(
                asset,
                dataset_key,
                region_code,
                resolved_ds,
                region_error,
            )
        )

    asset_records = [
        _build_asset_record(
            item.asset,
            item.dataset_key,
            item.region_code,
            item.resolution_error,
        )
        for item in resolved_assets
    ]
    if asset_records:
        unique_records: list[dict[str, Any]] = []
        seen_keys: set[str] = set()
        for record in asset_records:
            asset_key = _asset_key(record)
            if asset_key in seen_keys:
                continue
            seen_keys.add(asset_key)
            unique_records.append(record)

        requested_asset_batch = _env_int("DAMODARAN_ASSET_BATCH_SIZE", _MAX_ASSET_BATCH)
        asset_batch_size = max(1, min(_MAX_ASSET_BATCH, requested_asset_batch))
        if asset_batch_size != requested_asset_batch:
            logger.warning(
                "Clamping DAMODARAN_ASSET_BATCH_SIZE=%s to %s",
                requested_asset_batch,
                asset_batch_size,
            )
        client.record_assets_batch(unique_records, chunk_size=asset_batch_size)
    return resolved_assets


def _prefetch_snapshots(
    resolved_assets: list[_ResolvedAsset],
    client: ConvexSyncClient,
    force_rebuild: bool,
    timing: _TimingSummary | None,
) -> bool:
    snapshot_map: dict[tuple[str, str, str], dict[str, Any]] = {}
    bulk_failed = False
    if not force_rebuild:
        seen_identities: set[tuple[str, str, str]] = set()
        identities: list[dict[str, str]] = []
        for item in resolved_assets:
            as_of_date = item.asset.as_of_date
            if not as_of_date:
                continue
            key = (item.dataset_key, item.region_code, as_of_date)
            if key in seen_identities:
                continue
            seen_identities.add(key)
            identities.append(
                {
                    "datasetKey": item.dataset_key,
                    "regionCode": item.region_code,
                    "asOfDate": as_of_date,
                }
            )

        requested_batch_size = _env_int(
            "DAMODARAN_SNAPSHOT_BATCH_SIZE",
            _MAX_SNAPSHOT_IDENTITY_BATCH,
        )
        batch_size = max(1, min(_MAX_SNAPSHOT_IDENTITY_BATCH, requested_batch_size))
        if batch_size != requested_batch_size:
            logger.warning(
                "Clamping DAMODARAN_SNAPSHOT_BATCH_SIZE=%s to %s",
                requested_batch_size,
                batch_size,
            )
        try:
            for chunk in _chunked(identities, batch_size):
                if not chunk:
                    continue
                with _maybe_time(timing, "get_snapshot_by_identity_batch"):
                    results = client.get_snapshots_by_identity_batch(chunk)
                for result in results:
                    key = (
                        result.get("datasetKey"),
                        result.get("regionCode"),
                        result.get("asOfDate"),
                    )
                    if all(key):
                        snapshot_map[key] = result
        except Exception as exc:
            logger.warning("Batch snapshot lookup failed, falling back to per-asset: %s", exc)
            bulk_failed = True

    for item in resolved_assets:
        if not item.asset.as_of_date:
            continue
        key = (item.dataset_key, item.region_code, item.asset.as_of_date)
        item.snapshot = snapshot_map.get(key)
    return bulk_failed


def _process_assets_serial_or_parallel(
    resolved_assets: list[_ResolvedAsset],
    client: ConvexSyncClient,
    sync_log_id: str,
    datasets_map: dict[str, Any],
    force_rebuild: bool,
    additive_only: bool,
    conditional_get_enabled: bool,
    head_precheck_enabled: bool,
    bulk_failed: bool,
    trust_archive_immutable: bool,
    timing: _TimingSummary | None,
) -> _RunCounts:
    counts = _RunCounts()
    requested_workers = _env_int("DAMODARAN_SYNC_WORKERS", 1)
    max_workers = max(1, requested_workers)
    if max_workers != requested_workers:
        logger.warning(
            "Clamping DAMODARAN_SYNC_WORKERS=%s to %s",
            requested_workers,
            max_workers,
        )
    if max_workers > 1:
        # Avoid shared timing state across threads.
        timing = None

    def _add(outcome: _AssetOutcome) -> None:
        counts.success += outcome.success
        counts.skipped += outcome.skipped
        counts.error += outcome.error
        counts.downloaded += outcome.downloaded
        counts.rows_inserted += outcome.rows_inserted

    if max_workers <= 1:
        for item in resolved_assets:
            outcome = _process_asset(
                item,
                client,
                sync_log_id,
                datasets_map,
                force_rebuild,
                additive_only,
                conditional_get_enabled,
                head_precheck_enabled,
                bulk_failed,
                trust_archive_immutable,
                timing,
            )
            _add(outcome)
        return counts

    thread_local = threading.local()

    def _process_asset_worker(item: _ResolvedAsset) -> _AssetOutcome:
        worker_client = getattr(thread_local, "client", None)
        if worker_client is None:
            worker_client = client.clone() if hasattr(client, "clone") else client
            thread_local.client = worker_client
        return _process_asset(
            item,
            worker_client,
            sync_log_id,
            datasets_map,
            force_rebuild,
            additive_only,
            conditional_get_enabled,
            head_precheck_enabled,
            bulk_failed,
            trust_archive_immutable,
            timing,
        )

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_map = {
            executor.submit(_process_asset_worker, item): item for item in resolved_assets
        }
        for future in as_completed(future_map):
            _add(future.result())
    return counts


def _finalize_sync_log(
    client: ConvexSyncClient,
    sync_log_id: str,
    counts: _RunCounts,
    manifest_hash: str,
    manifest_source: str,
    page_type: str,
    assets_count: int,
) -> str:
    final_status = "success"
    if counts.error > 0:
        final_status = "partial" if counts.success > 0 else "failed"
    elif counts.success == 0 and counts.skipped == 0:
        pass

    client.increment_sync_log(
        sync_log_id,
        {
            "assetsDownloaded": counts.downloaded,
            "assetsSkipped": counts.skipped,
            "rowsInserted": counts.rows_inserted,
            "errorCount": counts.error,
        },
    )
    client.finish_sync_log(sync_log_id, final_status)
    client.upsert_manifest(
        page_type,
        manifest_hash,
        manifest_source,
        assets_count,
    )
    return final_status


def process_page(
    page_url: str,
    page_type: str,
    client: ConvexSyncClient,
    force_rebuild: bool = False,
    *,
    additive_only: bool = False,
    head_precheck: bool | None = None,
) -> None:
    logger.info(f"Starting sync for {page_type} page: {page_url}")

    profile_enabled = os.getenv("DAMODARAN_SYNC_PROFILE", "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    timing = _TimingSummary() if profile_enabled else None
    limit_raw = os.getenv("DAMODARAN_SYNC_LIMIT", "").strip()
    limit_assets = int(limit_raw) if limit_raw.isdigit() and int(limit_raw) > 0 else None
    
    sync_log_id = None
    try:
        if additive_only and force_rebuild:
            logger.warning(
                "Ignoring force_rebuild because additive_only is enabled."
            )
        effective_force_rebuild = force_rebuild and not additive_only

        refs = client.get_reference()
        regions_list = refs["regions"]
        datasets_list = refs["datasets"]
        mappings_list = refs["datasetMappings"]
        datasets_map = {d["key"].lower(): d for d in datasets_list}

        try:
            discovery_result = _discover_assets_for_page(
                page_url, page_type, limit_assets, timing
            )
        except Exception as exc:
            sync_log_id = client.create_sync_log(f"full_{page_type}", None)
            client.append_sync_error(
                sync_log_id,
                "discovery_phase",
                "discover",
                f"{type(exc).__name__}: {str(exc)}",
            )
            client.finish_sync_log(sync_log_id, "failed")
            raise

        sync_type = f"full_{page_type}"
        if profile_enabled:
            sync_type = f"profile_{sync_type}"

        if _env_bool("DAMODARAN_FAST_EXIT_IF_MANIFEST_UNCHANGED", False):
            latest_manifest = client.get_latest_manifest(page_type)
            if (
                latest_manifest
                and latest_manifest.get("manifestHash") == discovery_result.manifest_hash
            ):
                sync_log_id = client.create_sync_log(
                    sync_type, discovery_result.page_last_updated
                )
                client.increment_sync_log(
                    sync_log_id,
                    {
                        "assetsDiscovered": len(discovery_result.assets),
                        "assetsSkipped": len(discovery_result.assets),
                    },
                )
                client.finish_sync_log(sync_log_id, "success")
                client.upsert_manifest(
                    page_type,
                    discovery_result.manifest_hash,
                    discovery_result.manifest_source,
                    len(discovery_result.assets),
                )
                logger.info(
                    "Manifest unchanged for %s; fast exit with %s assets.",
                    page_type,
                    len(discovery_result.assets),
                )
                return

        sync_log_id = client.create_sync_log(sync_type, discovery_result.page_last_updated)
        client.increment_sync_log(sync_log_id, {"assetsDiscovered": len(discovery_result.assets)})
        if timing is not None:
            timing.inc("assets_discovered", len(discovery_result.assets))
            timing.inc("force_rebuild", 1 if effective_force_rebuild else 0)
            timing.inc("additive_only", 1 if additive_only else 0)
            if limit_assets is not None:
                timing.inc("limit_assets", limit_assets)

        resolved_assets = _resolve_assets_for_page(
            discovery_result.assets,
            mappings_list,
            datasets_map,
            regions_list,
            client,
            timing,
        )
        bulk_failed = _prefetch_snapshots(
            resolved_assets,
            client,
            effective_force_rebuild,
            timing,
        )

        trust_archive_immutable = _env_bool("DAMODARAN_TRUST_ARCHIVE_IMMUTABLE", False)
        conditional_get_enabled = _env_bool("DAMODARAN_CONDITIONAL_GET", True)
        head_precheck_enabled = (
            _env_bool("DAMODARAN_HEAD_PRECHECK", False)
            if head_precheck is None
            else head_precheck
        )

        counts = _process_assets_serial_or_parallel(
            resolved_assets,
            client,
            sync_log_id,
            datasets_map,
            effective_force_rebuild,
            additive_only,
            conditional_get_enabled,
            head_precheck_enabled,
            bulk_failed,
            trust_archive_immutable,
            timing,
        )
        final_status = _finalize_sync_log(
            client,
            sync_log_id,
            counts,
            discovery_result.manifest_hash,
            discovery_result.manifest_source,
            page_type,
            len(discovery_result.assets),
        )
        logger.info(
            "Sync finished: %s. Success: %s, Skipped: %s, Errors: %s",
            final_status,
            counts.success,
            counts.skipped,
            counts.error,
        )
        if timing is not None:
            logger.info("%s", timing.report())
    except Exception as exc:
        logger.error("Fatal error in sync: %s", exc)
        traceback.print_exc()
        if sync_log_id:
            client.finish_sync_log(sync_log_id, "failed")
        raise
