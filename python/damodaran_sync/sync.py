from __future__ import annotations

import logging
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass

from damodaran_sync.convex_client import ConvexSyncClient
from damodaran_sync.sync_discovery import (
    discover_assets_for_page,
    prefetch_snapshots,
    resolve_assets_for_page,
)
from damodaran_sync.sync_options import SyncRunOptions
from damodaran_sync.sync_resolution import ResolvedAsset
from damodaran_sync.sync_skip_policy import run_download_stage
from damodaran_sync.sync_timing import TimingSummary, maybe_time
from damodaran_sync.sync_upload import (
    build_snapshot_metadata,
    parse_downloaded_asset,
    transform_parsed_asset,
    upload_asset_rows,
)

logger = logging.getLogger(__name__)


@dataclass
class _AssetOutcome:
    success: int = 0
    skipped: int = 0
    error: int = 0
    downloaded: int = 0
    rows_inserted: int = 0


@dataclass
class _RunCounts:
    success: int = 0
    skipped: int = 0
    error: int = 0
    downloaded: int = 0
    rows_inserted: int = 0


def _process_asset(
    item: ResolvedAsset,
    client: ConvexSyncClient,
    sync_log_id: str,
    datasets_map: dict[str, object],
    options: SyncRunOptions,
    bulk_failed: bool,
    timing: TimingSummary | None,
) -> _AssetOutcome:
    asset = item.asset
    dataset_key = item.dataset_key
    region_code = item.region_code
    outcome = _AssetOutcome()

    try:
        stage = "download"
        if not asset.as_of_date:
            outcome.skipped += 1
            return outcome

        download_stage = run_download_stage(
            item,
            client,
            force_rebuild=options.effective_force_rebuild,
            additive_only=options.additive_only,
            conditional_get_enabled=options.conditional_get_enabled,
            head_precheck_enabled=options.head_precheck_enabled,
            bulk_failed=bulk_failed,
            trust_archive_immutable=options.trust_archive_immutable,
            timing=timing,
            outcome=outcome,
        )
        if download_stage is None:
            return outcome

        download_res, downloaded_at = download_stage
        stage = "parse"
        parsed, parsed_at = parse_downloaded_asset(download_res, timing)
        stage = "transform"
        transformed = transform_parsed_asset(parsed, timing)
        stage = "upload"

        metadata = build_snapshot_metadata(
            asset=asset,
            dataset_key=dataset_key,
            datasets_map=datasets_map,
            download_res=download_res,
            parsed=parsed,
            transformed=transformed,
            downloaded_at=downloaded_at,
            parsed_at=parsed_at,
        )
        uploaded, inserted_rows = upload_asset_rows(
            client,
            dataset_key=dataset_key,
            region_code=region_code,
            as_of_date=asset.as_of_date,
            metadata=metadata,
            transformed=transformed,
            force_rebuild=options.effective_force_rebuild,
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


def _process_assets_serial_or_parallel(
    resolved_assets: list[ResolvedAsset],
    client: ConvexSyncClient,
    sync_log_id: str,
    datasets_map: dict[str, object],
    options: SyncRunOptions,
    bulk_failed: bool,
    timing: TimingSummary | None,
) -> _RunCounts:
    counts = _RunCounts()
    max_workers = options.sync_workers
    if max_workers > 1:
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
                options,
                bulk_failed,
                timing,
            )
            _add(outcome)
        return counts

    thread_local = threading.local()

    def _process_asset_worker(item: ResolvedAsset) -> _AssetOutcome:
        worker_client = getattr(thread_local, "client", None)
        if worker_client is None:
            worker_client = client.clone() if hasattr(client, "clone") else client
            thread_local.client = worker_client
        return _process_asset(
            item,
            worker_client,
            sync_log_id,
            datasets_map,
            options,
            bulk_failed,
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
    logger.info("Starting sync for %s page: %s", page_type, page_url)

    options = SyncRunOptions(
        force_rebuild=force_rebuild,
        additive_only=additive_only,
        head_precheck=head_precheck,
    )
    timing = TimingSummary() if options.profile_enabled else None
    sync_log_id = None
    try:
        if additive_only and force_rebuild:
            logger.warning("Ignoring force_rebuild because additive_only is enabled.")

        refs = client.get_reference()
        regions_list = refs["regions"]
        datasets_list = refs["datasets"]
        mappings_list = refs["datasetMappings"]
        datasets_map = {d["key"].lower(): d for d in datasets_list}

        try:
            discovery_result = discover_assets_for_page(
                page_url,
                page_type,
                options.limit_assets,
                timing,
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
        if options.profile_enabled:
            sync_type = f"profile_{sync_type}"

        if options.fast_exit_if_manifest_unchanged:
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
            timing.inc("force_rebuild", 1 if options.effective_force_rebuild else 0)
            timing.inc("additive_only", 1 if additive_only else 0)
            if options.limit_assets is not None:
                timing.inc("limit_assets", options.limit_assets)

        resolved_assets = resolve_assets_for_page(
            discovery_result.assets,
            mappings_list,
            datasets_map,
            regions_list,
            client,
            timing,
            options.asset_batch_size,
        )
        bulk_failed = prefetch_snapshots(
            resolved_assets,
            client,
            options.effective_force_rebuild,
            timing,
            options.snapshot_batch_size,
        )

        counts = _process_assets_serial_or_parallel(
            resolved_assets,
            client,
            sync_log_id,
            datasets_map,
            options,
            bulk_failed,
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
