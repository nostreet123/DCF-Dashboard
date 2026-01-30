from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import tempfile
import threading
import traceback
import time
import requests
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlparse

from damodaran_sync import discover, download, excel_parse, transform, mapping_resolver, mirror
from damodaran_sync.convex_client import ConvexSyncClient

logger = logging.getLogger(__name__)
_SYNC_CACHE: dict[str, str] = {}
_SYNC_CACHE_LOCK = threading.Lock()
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
class _ResolvedAsset:
    asset: discover.DiscoveredAsset
    dataset_key: str
    region_code: str
    resolution_error: str | None
    resolved_ds: bool
    snapshot: dict[str, Any] | None = None


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


def _estimate_payload_bytes(payload: dict[str, Any]) -> int:
    return len(
        json.dumps(payload, default=str, separators=(",", ":"), ensure_ascii=True).encode(
            "utf-8"
        )
    )


def _iter_tabledata_batches(
    rows: list[transform.NormalizedRow],
    max_rows: int,
    max_bytes: int,
) -> Iterable[list[dict[str, Any]]]:
    batch: list[dict[str, Any]] = []
    batch_bytes = 2  # JSON "[]"

    for row in rows:
        payload: dict[str, Any] = {
            "rowIndex": row.row_index,
            "primaryKey": row.primary_key,
            "primaryKeyNorm": row.primary_key_norm,
            "metrics": row.metrics,
        }
        if row.secondary_key is not None:
            payload["secondaryKey"] = row.secondary_key

        payload_bytes = _estimate_payload_bytes(payload)
        projected = (2 + payload_bytes) if not batch else (batch_bytes + 1 + payload_bytes)

        if batch and (len(batch) >= max_rows or projected > max_bytes):
            yield batch
            batch = []
            batch_bytes = 2
            projected = 2 + payload_bytes

        batch.append(payload)
        batch_bytes = projected

    if batch:
        yield batch


def _contains_any(haystack: str, needles: list[str]) -> bool:
    return any(needle in haystack for needle in needles)


def _is_batch_too_large_error(exc: BaseException) -> bool:
    cursor: BaseException | None = exc
    needles = [
        "Batch too large",
        "Function argument size",
        "Data written",
        "payload",
        "too large",
    ]
    while cursor is not None:
        message = str(cursor)
        if _contains_any(message, needles):
            return True
        cursor = cursor.__cause__ or cursor.__context__
    return False


def _insert_rows_resilient(
    client: ConvexSyncClient,
    snapshot_id: str,
    build_id: str,
    rows: list[dict[str, Any]],
) -> tuple[int, int]:
    try:
        return client.insert_rows(snapshot_id, build_id, rows), 1
    except Exception as exc:
        if len(rows) <= 1 or not _is_batch_too_large_error(exc):
            raise
        mid = len(rows) // 2
        left_inserted, left_calls = _insert_rows_resilient(
            client, snapshot_id, build_id, rows[:mid]
        )
        right_inserted, right_calls = _insert_rows_resilient(
            client, snapshot_id, build_id, rows[mid:]
        )
        return left_inserted + right_inserted, left_calls + right_calls


def _process_asset(
    item: _ResolvedAsset,
    client: ConvexSyncClient,
    sync_log_id: str,
    datasets_map: dict[str, Any],
    force_rebuild: bool,
    conditional_get_enabled: bool,
    head_precheck_enabled: bool,
    bulk_failed: bool,
    trust_archive_immutable: bool,
    timing: _TimingSummary | None,
) -> _AssetOutcome:
    asset = item.asset
    dataset_key = item.dataset_key
    region_code = item.region_code
    resolution_error = item.resolution_error
    outcome = _AssetOutcome()

    try:
        stage = "download"
        # 6. Check Validity for Ingestion
        # Skip ONLY if asOfDate is missing.
        if not asset.as_of_date:
            outcome.skipped += 1
            return outcome

        snapshot = item.snapshot
        if snapshot is None and not force_rebuild and bulk_failed:
            with _maybe_time(timing, "get_snapshot_by_identity"):
                snapshot = client.get_snapshot_by_identity(
                    dataset_key,
                    region_code,
                    asset.as_of_date,
                )

        if (
            trust_archive_immutable
            and asset.page_type == "archive"
            and not force_rebuild
            and snapshot
            and snapshot.get("activeBuildId")
            and snapshot.get("dataStatus") == "ready"
        ):
            outcome.skipped += 1
            return outcome

        # 8. Download
        stage = "download"
        conditional_etag = None
        conditional_last_modified = None
        if (
            conditional_get_enabled
            and not force_rebuild
            and snapshot
            and snapshot.get("activeBuildId")
            and snapshot.get("dataStatus") == "ready"
        ):
            conditional_etag = snapshot.get("sourceEtag")
            conditional_last_modified = snapshot.get("sourceLastModified")
            if not (conditional_etag or conditional_last_modified):
                conditional_etag = None
                conditional_last_modified = None
        if (
            head_precheck_enabled
            and not force_rebuild
            and snapshot
            and snapshot.get("activeBuildId")
            and snapshot.get("dataStatus") == "ready"
            and (conditional_etag or conditional_last_modified)
        ):
            try:
                with _maybe_time(timing, "head_precheck"):
                    probe = download.probe_remote(
                        asset.source_url,
                        etag=conditional_etag,
                        last_modified=conditional_last_modified,
                    )
            except Exception:
                probe = None
            if probe is not None and probe.not_modified:
                outcome.skipped += 1
                return outcome
        try:
            with _maybe_time(timing, "download"):
                download_res = download.download_file(
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
                outcome.skipped += 1
                return outcome
            raise
        stage = "parse"
        downloaded_at = int(time.time() * 1000)

        if (
            not force_rebuild
            and download_res.not_modified
            and snapshot
            and snapshot.get("activeBuildId")
            and snapshot.get("dataStatus") == "ready"
        ):
            outcome.skipped += 1
            return outcome

        outcome.downloaded += 1

        if (
            not force_rebuild
            and snapshot
            and snapshot.get("activeBuildId")
            and snapshot.get("fileHash") == download_res.sha256
            and snapshot.get("dataStatus") == "ready"
        ):
            outcome.skipped += 1
            return outcome

        # 10. Parse
        with _maybe_time(timing, "parse_excel"):
            parsed = excel_parse.parse_excel(download_res.path)
        stage = "transform"
        parsed_at = int(time.time() * 1000)

        # 11. Transform & Ingest
        dataset_def = datasets_map.get(dataset_key.lower())
        data_type = dataset_def.get("dataType", "other") if dataset_def else "other"

        with _maybe_time(timing, "transform"):
            transformed = transform.transform_table(parsed)
        stage = "upload"

        # Metadata construction
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

        # Use UUID for unique build identification per sync attempt.
        build_id = uuid.uuid4().hex

        # Upsert Snapshot
        with _maybe_time(timing, "upsert_snapshot"):
            upsert_res = client.upsert_snapshot(
                dataset_key,
                region_code,
                asset.as_of_date,
                build_id,
                metadata,
                force_rebuild=force_rebuild,
            )

        # Actions: created, updated, unchanged
        if upsert_res.action == "unchanged" and not force_rebuild:
            outcome.skipped += 1
            return outcome

        # Insert Rows
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

        outcome.rows_inserted += total_inserted

        # Finalize snapshot to set activeBuildId (for both new and updated snapshots)
        if upsert_res.action in ("created", "updated"):
            with _maybe_time(timing, "finalize_snapshot"):
                client.finalize_snapshot(upsert_res.snapshot_id, build_id, metadata)

        # Cleanup previous build
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

def _build_asset_record(
    asset: discover.DiscoveredAsset,
    dataset_key: str,
    region_code: str,
    resolution_error: str | None,
) -> dict[str, Any]:
    # Per requirements:
    # - resolved is True IFF as_of_date exists.
    # - resolvedDatasetKey/resolvedRegionCode are always recorded.
    # - discoveredAt is NOT included in the payload.
    
    asset_record = {
        "sourcePageUrl": asset.source_page_url,
        "pageType": asset.page_type,
        "sourceUrl": asset.source_url,
        "fileName": asset.file_name,
        "linkLabel": asset.link_label,
        "resolved": asset.as_of_date is not None,
        "resolvedDatasetKey": dataset_key,
        "resolvedRegionCode": region_code,
    }
    if asset.page_last_updated is not None:
        asset_record["pageLastUpdated"] = asset.page_last_updated
    if asset.as_of_date is not None:
        asset_record["resolvedAsOfDate"] = asset.as_of_date
    if asset.as_of_date_source is not None:
        asset_record["resolvedAsOfDateSource"] = asset.as_of_date_source
    error_value = resolution_error or asset.resolution_error
    if error_value is not None:
        asset_record["resolutionError"] = error_value
    return asset_record


def process_page(
    page_url: str,
    page_type: str,
    client: ConvexSyncClient,
    force_rebuild: bool = False,
    *,
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
    
    # Context for error handling if discovery fails before log creation
    sync_log_id = None

    try:
        # 1. Fetch Reference Data
        refs = client.get_reference()
        regions_list = refs["regions"]
        datasets_list = refs["datasets"]
        mappings_list = refs["datasetMappings"]
        
        # Convert datasets list to dict for lookup, using lowercase keys
        datasets_map = {d["key"].lower(): d for d in datasets_list}

        # 2. Discover (or use mirror manifest)
        assets: list[discover.DiscoveredAsset] = []
        page_last_updated: str | None = None
        manifest_hash: str | None = None
        manifest_source = "live"
        mirror_manifest_url = os.getenv("DAMODARAN_MIRROR_MANIFEST_URL")
        try:
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
        except Exception as e:
            # If discovery fails, we must create a log to record the error
            # We don't have page_last_updated since discovery failed
            sync_log_id = client.create_sync_log(f"full_{page_type}", None)
            client.append_sync_error(
                sync_log_id,
                "discovery_phase",
                "discover",
                f"{type(e).__name__}: {str(e)}",
            )
            client.finish_sync_log(sync_log_id, "failed")
            raise

        if limit_assets is not None:
            assets = assets[:limit_assets]

        if manifest_hash is None:
            manifest_hash = _stable_manifest_hash(assets)

        sync_type = f"full_{page_type}"
        if profile_enabled:
            sync_type = f"profile_{sync_type}"

        fast_exit = _env_bool("DAMODARAN_FAST_EXIT_IF_MANIFEST_UNCHANGED", False)
        if manifest_hash and fast_exit:
            latest_manifest = client.get_latest_manifest(page_type)
            if latest_manifest and latest_manifest.get("manifestHash") == manifest_hash:
                sync_log_id = client.create_sync_log(sync_type, page_last_updated)
                client.increment_sync_log(
                    sync_log_id,
                    {
                        "assetsDiscovered": len(assets),
                        "assetsSkipped": len(assets),
                    },
                )
                client.finish_sync_log(sync_log_id, "success")
                client.upsert_manifest(
                    page_type,
                    manifest_hash,
                    manifest_source,
                    len(assets),
                )
                logger.info(
                    "Manifest unchanged for %s; fast exit with %s assets.",
                    page_type,
                    len(assets),
                )
                return

        # 3. Start Sync Log (After discovery, so we have pageLastUpdated)
        sync_log_id = client.create_sync_log(sync_type, page_last_updated)

        client.increment_sync_log(
            sync_log_id, {"assetsDiscovered": len(assets)}
        )
        if timing is not None:
            timing.inc("assets_discovered", len(assets))
            timing.inc("force_rebuild", 1 if force_rebuild else 0)
            if limit_assets is not None:
                timing.inc("limit_assets", limit_assets)

        success_count = 0
        skip_count = 0
        error_count = 0
        downloaded_count = 0
        rows_inserted_total = 0

        resolved_assets: list[_ResolvedAsset] = []
        for asset in assets:
            # 4. Resolve Identity (pre-pass)
            with _maybe_time(timing, "resolve_dataset"):
                stem = mapping_resolver.normalize_stem(asset.file_name)
                dataset_key, resolved_ds = mapping_resolver.resolve_dataset_key(
                    stem, mappings_list
                )

            region_code = "unknown"
            resolution_error = asset.resolution_error

            with _maybe_time(timing, "resolve_region"):
                r_code, region_error = mapping_resolver.resolve_region_code(
                    stem,
                    asset.link_label,
                    dataset_key,
                    datasets_map,
                    regions_list,
                )
            region_code = r_code
            if region_error:
                resolution_error = region_error

            if not resolved_ds and not resolution_error:
                resolution_error = "unmapped_dataset"

            resolved_assets.append(
                _ResolvedAsset(
                    asset=asset,
                    dataset_key=dataset_key,
                    region_code=region_code,
                    resolution_error=resolution_error,
                    resolved_ds=resolved_ds,
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

        # Bulk snapshot lookup to reduce per-asset roundtrips.
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

        trust_archive_immutable = _env_bool("DAMODARAN_TRUST_ARCHIVE_IMMUTABLE", False)
        conditional_get_enabled = _env_bool("DAMODARAN_CONDITIONAL_GET", True)
        head_precheck_enabled = (
            _env_bool("DAMODARAN_HEAD_PRECHECK", False)
            if head_precheck is None
            else head_precheck
        )
        requested_workers = _env_int("DAMODARAN_SYNC_WORKERS", 1)
        max_workers = max(1, requested_workers)
        if max_workers != requested_workers:
            logger.warning(
                "Clamping DAMODARAN_SYNC_WORKERS=%s to %s",
                requested_workers,
                max_workers,
            )
        if max_workers > 1:
            # Avoid shared timing across threads.
            timing = None
        shared_client: ConvexSyncClient | None = client if max_workers <= 1 else None

        if max_workers <= 1:
            for item in resolved_assets:
                outcome = _process_asset(
                    item,
                    shared_client,
                    sync_log_id,
                    datasets_map,
                    force_rebuild,
                    conditional_get_enabled,
                    head_precheck_enabled,
                    bulk_failed,
                    trust_archive_immutable,
                    timing,
                )
                success_count += outcome.success
                skip_count += outcome.skipped
                error_count += outcome.error
                downloaded_count += outcome.downloaded
                rows_inserted_total += outcome.rows_inserted
        else:
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
                    conditional_get_enabled,
                    head_precheck_enabled,
                    bulk_failed,
                    trust_archive_immutable,
                    timing,
                )

            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                future_map = {
                    executor.submit(
                        _process_asset_worker,
                        item,
                    ): item
                    for item in resolved_assets
                }
                for future in as_completed(future_map):
                    outcome = future.result()
                    success_count += outcome.success
                    skip_count += outcome.skipped
                    error_count += outcome.error
                    downloaded_count += outcome.downloaded
                    rows_inserted_total += outcome.rows_inserted

        # Finish Log
        final_status = "success"
        if error_count > 0:
            final_status = "partial" if success_count > 0 else "failed"
        elif success_count == 0 and skip_count == 0:
             # Nothing found?
             pass

        client.increment_sync_log(
            sync_log_id,
            {
                "assetsDownloaded": downloaded_count,
                "assetsSkipped": skip_count,
                "rowsInserted": rows_inserted_total,
                "errorCount": error_count,
            },
        )
        client.finish_sync_log(sync_log_id, final_status)
        if manifest_hash:
            client.upsert_manifest(
                page_type,
                manifest_hash,
                manifest_source,
                len(assets),
            )
        logger.info(f"Sync finished: {final_status}. Success: {success_count}, Skipped: {skip_count}, Errors: {error_count}")
        if timing is not None:
            print(timing.report())

    except Exception as e:
        logger.error(f"Fatal error in sync: {e}")
        traceback.print_exc()
        if sync_log_id:
            client.finish_sync_log(sync_log_id, "failed")
        raise


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
