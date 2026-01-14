from __future__ import annotations

import logging
import traceback
import time
import requests
import uuid
from typing import Any

from damodaran_sync import discover, download, excel_parse, transform, mapping_resolver
from damodaran_sync.convex_client import ConvexSyncClient

logger = logging.getLogger(__name__)


def _record_asset_resolution(
    client: ConvexSyncClient,
    asset: discover.DiscoveredAsset,
    dataset_key: str,
    region_code: str,
    resolution_error: str | None,
) -> None:
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
    client.record_asset(asset_record)


def process_page(
    page_url: str,
    page_type: str,
    client: ConvexSyncClient,
    force_rebuild: bool = False,
) -> None:
    logger.info(f"Starting sync for {page_type} page: {page_url}")
    
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

        # 2. Discover
        try:
            discovery = discover.discover_page_assets(page_url, page_type)
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

        # 3. Start Sync Log (After discovery, so we have pageLastUpdated)
        sync_log_id = client.create_sync_log(f"full_{page_type}", discovery.page_last_updated)

        client.increment_sync_log(
            sync_log_id, {"assetsDiscovered": len(discovery.assets)}
        )

        success_count = 0
        skip_count = 0
        error_count = 0

        for asset in discovery.assets:
            try:
                stage = "download"
                # 4. Resolve Identity
                stem = mapping_resolver.normalize_stem(asset.file_name)
                dataset_key, resolved_ds = mapping_resolver.resolve_dataset_key(
                    stem, mappings_list
                )
                
                region_code = "unknown"
                resolution_error = asset.resolution_error
                
                # Try to resolve region even if dataset wasn't mapped (fallback key)
                # But typically region resolution depends on dataset context.
                # If resolved_ds is false, dataset_key is the stem.
                
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
                     # If we didn't resolve dataset but no other error, mark as unmapped
                     resolution_error = "unmapped_dataset"

                # 6. Check Validity for Ingestion
                # Skip ONLY if asOfDate is missing.
                if not asset.as_of_date:
                    _record_asset_resolution(
                        client,
                        asset,
                        dataset_key,
                        region_code,
                        resolution_error,
                    )
                    client.increment_sync_log(sync_log_id, {"assetsSkipped": 1})
                    skip_count += 1
                    continue

                snapshot = None
                if not force_rebuild:
                    snapshot = client.get_snapshot_by_identity(
                        dataset_key,
                        region_code,
                        asset.as_of_date,
                    )

                # 7. Record Asset (proceed to download)
                _record_asset_resolution(
                    client,
                    asset,
                    dataset_key,
                    region_code,
                    resolution_error,
                )

                # 8. Download
                stage = "download"
                try:
                    download_res = download.download_file(asset.source_url)
                except requests.HTTPError as exc:
                    response = exc.response
                    status_code = response.status_code if response is not None else None
                    if status_code == 404:
                        _record_asset_resolution(
                            client,
                            asset,
                            dataset_key,
                            region_code,
                            "missing_url",
                        )
                        client.increment_sync_log(sync_log_id, {"assetsSkipped": 1})
                        skip_count += 1
                        continue
                    raise
                stage = "parse"
                client.increment_sync_log(sync_log_id, {"assetsDownloaded": 1})
                downloaded_at = int(time.time() * 1000)

                if (
                    not force_rebuild
                    and snapshot
                    and snapshot.get("activeBuildId")
                    and snapshot.get("fileHash") == download_res.sha256
                    and snapshot.get("dataStatus") == "ready"
                ):
                    client.increment_sync_log(sync_log_id, {"assetsSkipped": 1})
                    skip_count += 1
                    continue

                # 10. Parse
                parsed = excel_parse.parse_excel(download_res.path)
                stage = "transform"
                parsed_at = int(time.time() * 1000)

                # 11. Transform & Ingest
                dataset_def = datasets_map.get(dataset_key.lower())
                data_type = dataset_def.get("dataType", "other") if dataset_def else "other"

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
                    client.increment_sync_log(sync_log_id, {"assetsSkipped": 1})
                    skip_count += 1
                    continue

                # Insert Rows
                BATCH_SIZE = 1000
                total_inserted = 0
                
                rows_to_insert = transformed.rows
                for i in range(0, len(rows_to_insert), BATCH_SIZE):
                    batch = rows_to_insert[i : i + BATCH_SIZE]
                    batch_payloads = []
                    for row in batch:
                        payload = {
                            "rowIndex": row.row_index,
                            "primaryKey": row.primary_key,
                            "primaryKeyNorm": row.primary_key_norm,
                            "metrics": row.metrics,
                        }
                        if row.secondary_key is not None:
                            payload["secondaryKey"] = row.secondary_key
                        batch_payloads.append(payload)
                    inserted = client.insert_rows(upsert_res.snapshot_id, build_id, batch_payloads)
                    total_inserted += inserted

                client.increment_sync_log(sync_log_id, {"rowsInserted": total_inserted})

                # Finalize snapshot to set activeBuildId (for both new and updated snapshots)
                if upsert_res.action in ("created", "updated"):
                    client.finalize_snapshot(upsert_res.snapshot_id, build_id, metadata)

                # Cleanup previous build
                if upsert_res.previous_build_id:
                    while True:
                        deleted = client.delete_rows(upsert_res.snapshot_id, upsert_res.previous_build_id, 1000)
                        if deleted == 0:
                            break

                success_count += 1

            except Exception as e:
                error_count += 1
                client.increment_sync_log(sync_log_id, {"errorCount": 1})

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

        # Finish Log
        final_status = "success"
        if error_count > 0:
            final_status = "partial" if success_count > 0 else "failed"
        elif success_count == 0 and skip_count == 0:
             # Nothing found?
             pass

        client.finish_sync_log(sync_log_id, final_status)
        logger.info(f"Sync finished: {final_status}. Success: {success_count}, Skipped: {skip_count}, Errors: {error_count}")

    except Exception as e:
        logger.error(f"Fatal error in sync: {e}")
        traceback.print_exc()
        if sync_log_id:
            client.finish_sync_log(sync_log_id, "failed")
        raise
