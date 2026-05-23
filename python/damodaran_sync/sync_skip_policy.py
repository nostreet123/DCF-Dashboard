from __future__ import annotations

import time
from typing import Any
from urllib.parse import urlparse

import requests

from damodaran_sync import discover, download
from damodaran_sync.convex_client import ConvexSyncClient
from damodaran_sync.sync_resolution import ResolvedAsset, _build_asset_record


def extra_allowed_hosts_for_asset(asset: discover.DiscoveredAsset) -> set[str]:
    hosts: set[str] = set(asset.allowed_host_hints)
    source_page_host = urlparse(asset.source_page_url).hostname
    if source_page_host:
        hosts.add(source_page_host)
    return hosts


def is_ready_snapshot(snapshot: dict[str, Any] | None) -> bool:
    return bool(
        snapshot
        and snapshot.get("activeBuildId")
        and snapshot.get("dataStatus") == "ready"
    )


def resolve_snapshot_for_asset(
    item: ResolvedAsset,
    client: ConvexSyncClient,
    force_rebuild: bool,
    bulk_failed: bool,
    timing: Any | None,
) -> dict[str, Any] | None:
    from damodaran_sync.sync_timing import maybe_time

    snapshot = item.snapshot
    if snapshot is None and not force_rebuild and bulk_failed:
        with maybe_time(timing, "get_snapshot_by_identity"):
            snapshot = client.get_snapshot_by_identity(
                item.dataset_key,
                item.region_code,
                item.asset.as_of_date,
            )
    return snapshot


def should_skip_before_download(
    asset: discover.DiscoveredAsset,
    snapshot: dict[str, Any] | None,
    *,
    force_rebuild: bool,
    additive_only: bool,
    trust_archive_immutable: bool,
) -> bool:
    if additive_only and is_ready_snapshot(snapshot):
        return True
    if (
        trust_archive_immutable
        and asset.page_type == "archive"
        and not force_rebuild
        and is_ready_snapshot(snapshot)
    ):
        return True
    return False


def resolve_conditional_headers(
    snapshot: dict[str, Any] | None,
    *,
    conditional_get_enabled: bool,
    force_rebuild: bool,
) -> tuple[str | None, str | None]:
    if not (conditional_get_enabled and not force_rebuild and is_ready_snapshot(snapshot)):
        return None, None

    conditional_etag = snapshot.get("sourceEtag")
    conditional_last_modified = snapshot.get("sourceLastModified")
    if conditional_etag or conditional_last_modified:
        return conditional_etag, conditional_last_modified
    return None, None


def should_skip_via_head_precheck(
    asset: discover.DiscoveredAsset,
    snapshot: dict[str, Any] | None,
    *,
    force_rebuild: bool,
    head_precheck_enabled: bool,
    conditional_etag: str | None,
    conditional_last_modified: str | None,
    timing: Any | None,
) -> bool:
    from damodaran_sync.sync_timing import maybe_time

    if (
        not head_precheck_enabled
        or force_rebuild
        or not is_ready_snapshot(snapshot)
        or not (conditional_etag or conditional_last_modified)
    ):
        return False

    try:
        with maybe_time(timing, "head_precheck"):
            probe = download.probe_remote(
                asset.source_url,
                etag=conditional_etag,
                last_modified=conditional_last_modified,
                extra_allowed_hosts=extra_allowed_hosts_for_asset(asset),
            )
    except Exception:
        probe = None
    return bool(probe is not None and probe.not_modified)


def download_asset_with_404_handling(
    asset: discover.DiscoveredAsset,
    dataset_key: str,
    region_code: str,
    client: ConvexSyncClient,
    *,
    conditional_etag: str | None,
    conditional_last_modified: str | None,
    timing: Any | None,
) -> download.DownloadResult | None:
    from damodaran_sync.sync_timing import maybe_time

    try:
        with maybe_time(timing, "download"):
            return download.download_file(
                asset.source_url,
                etag=conditional_etag,
                last_modified=conditional_last_modified,
                extra_allowed_hosts=extra_allowed_hosts_for_asset(asset),
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


def should_skip_after_download(
    snapshot: dict[str, Any] | None,
    download_res: download.DownloadResult,
    *,
    force_rebuild: bool,
) -> bool:
    return bool(
        not force_rebuild and download_res.not_modified and is_ready_snapshot(snapshot)
    )


def should_skip_same_hash(
    snapshot: dict[str, Any] | None,
    download_res: download.DownloadResult,
    *,
    force_rebuild: bool,
) -> bool:
    return bool(
        not force_rebuild
        and is_ready_snapshot(snapshot)
        and snapshot.get("fileHash") == download_res.sha256
    )


def run_download_stage(
    item: ResolvedAsset,
    client: ConvexSyncClient,
    *,
    force_rebuild: bool,
    additive_only: bool,
    conditional_get_enabled: bool,
    head_precheck_enabled: bool,
    bulk_failed: bool,
    trust_archive_immutable: bool,
    timing: Any | None,
    outcome: Any,
) -> tuple[download.DownloadResult, int] | None:
    asset = item.asset
    snapshot = resolve_snapshot_for_asset(
        item,
        client,
        force_rebuild,
        bulk_failed,
        timing,
    )

    if should_skip_before_download(
        asset,
        snapshot,
        force_rebuild=force_rebuild,
        additive_only=additive_only,
        trust_archive_immutable=trust_archive_immutable,
    ):
        outcome.skipped += 1
        return None

    conditional_etag, conditional_last_modified = resolve_conditional_headers(
        snapshot,
        conditional_get_enabled=conditional_get_enabled,
        force_rebuild=force_rebuild,
    )
    if should_skip_via_head_precheck(
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

    download_res = download_asset_with_404_handling(
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
    if should_skip_after_download(
        snapshot,
        download_res,
        force_rebuild=force_rebuild,
    ):
        outcome.skipped += 1
        return None

    outcome.downloaded += 1

    if should_skip_same_hash(
        snapshot,
        download_res,
        force_rebuild=force_rebuild,
    ):
        outcome.skipped += 1
        return None

    return download_res, downloaded_at
