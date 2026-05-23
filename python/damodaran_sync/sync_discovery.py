from __future__ import annotations

import hashlib
import json
import logging
import os
from dataclasses import dataclass
from typing import Any

from damodaran_sync import discover, mapping_resolver, mirror
from damodaran_sync.convex_client import ConvexSyncClient
from damodaran_sync.sync_options import SyncRunOptions, env_int
from damodaran_sync.sync_resolution import (
    ResolvedAsset,
    _build_asset_record,
    build_resolved_asset,
)

logger = logging.getLogger(__name__)

_MAX_SNAPSHOT_IDENTITY_BATCH = 100
_MAX_ASSET_BATCH = 500


@dataclass
class DiscoveryResult:
    assets: list[discover.DiscoveredAsset]
    page_last_updated: str | None
    manifest_hash: str
    manifest_source: str


def stable_manifest_hash(assets: list[discover.DiscoveredAsset]) -> str:
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
    manifest_items.sort(key=lambda item: tuple(item[k] for k in sorted(item.keys())))
    payload = json.dumps(
        manifest_items,
        separators=(",", ":"),
        sort_keys=True,
        ensure_ascii=True,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


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


def chunked(items: list[dict[str, str]], size: int) -> list[list[dict[str, str]]]:
    if size <= 0:
        return [items]
    return [items[i : i + size] for i in range(0, len(items), size)]


def discover_assets_for_page(
    page_url: str,
    page_type: str,
    limit_assets: int | None,
    timing: Any | None,
) -> DiscoveryResult:
    from damodaran_sync.sync_timing import maybe_time

    assets: list[discover.DiscoveredAsset] = []
    page_last_updated: str | None = None
    manifest_hash: str | None = None
    manifest_source = "live"
    mirror_manifest_url = os.getenv("DAMODARAN_MIRROR_MANIFEST_URL")
    if mirror_manifest_url:
        with maybe_time(timing, "fetch_manifest"):
            manifest = mirror.fetch_manifest(mirror_manifest_url, page_type)
        assets = manifest.assets
        manifest_hash = manifest.manifest_hash
        manifest_source = manifest.source
        page_last_updated = assets[0].page_last_updated if assets else None
    else:
        with maybe_time(timing, "discover"):
            discovery = discover.discover_page_assets(page_url, page_type)
        assets = discovery.assets
        page_last_updated = discovery.page_last_updated

    if limit_assets is not None:
        assets = assets[:limit_assets]

    if manifest_hash is None:
        manifest_hash = stable_manifest_hash(assets)

    return DiscoveryResult(
        assets=assets,
        page_last_updated=page_last_updated,
        manifest_hash=manifest_hash,
        manifest_source=manifest_source,
    )


def resolve_assets_for_page(
    assets: list[discover.DiscoveredAsset],
    mappings_list: list[dict[str, Any]],
    datasets_map: dict[str, Any],
    regions_list: list[dict[str, Any]],
    client: ConvexSyncClient,
    timing: Any | None,
    asset_batch_size: int,
) -> list[ResolvedAsset]:
    from damodaran_sync.sync_timing import maybe_time

    resolved_assets: list[ResolvedAsset] = []
    for asset in assets:
        with maybe_time(timing, "resolve_dataset"):
            stem = mapping_resolver.normalize_stem(asset.file_name)
            dataset_key, resolved_ds = mapping_resolver.resolve_dataset_key(
                stem, mappings_list
            )
        with maybe_time(timing, "resolve_region"):
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
            key = _asset_key(record)
            if key in seen_keys:
                continue
            seen_keys.add(key)
            unique_records.append(record)

        requested_asset_batch = env_int("DAMODARAN_ASSET_BATCH_SIZE", _MAX_ASSET_BATCH)
        clamped_batch_size = max(1, min(_MAX_ASSET_BATCH, requested_asset_batch))
        if clamped_batch_size != requested_asset_batch:
            logger.warning(
                "Clamping DAMODARAN_ASSET_BATCH_SIZE=%s to %s",
                requested_asset_batch,
                clamped_batch_size,
            )
        client.record_assets_batch(unique_records, chunk_size=asset_batch_size)
    return resolved_assets


def prefetch_snapshots(
    resolved_assets: list[ResolvedAsset],
    client: ConvexSyncClient,
    force_rebuild: bool,
    timing: Any | None,
    batch_size: int,
) -> bool:
    from damodaran_sync.sync_timing import maybe_time

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

        requested_batch_size = env_int(
            "DAMODARAN_SNAPSHOT_BATCH_SIZE",
            _MAX_SNAPSHOT_IDENTITY_BATCH,
        )
        clamped_batch_size = max(1, min(_MAX_SNAPSHOT_IDENTITY_BATCH, requested_batch_size))
        if clamped_batch_size != requested_batch_size:
            logger.warning(
                "Clamping DAMODARAN_SNAPSHOT_BATCH_SIZE=%s to %s",
                requested_batch_size,
                clamped_batch_size,
            )
        try:
            for chunk in chunked(identities, batch_size):
                if not chunk:
                    continue
                with maybe_time(timing, "get_snapshot_by_identity_batch"):
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
