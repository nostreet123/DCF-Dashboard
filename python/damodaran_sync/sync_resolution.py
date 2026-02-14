from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from damodaran_sync import discover


@dataclass
class ResolvedAsset:
    asset: discover.DiscoveredAsset
    dataset_key: str
    region_code: str
    resolution_error: str | None
    resolved_ds: bool
    snapshot: dict[str, Any] | None = None


def build_resolved_asset(
    asset: discover.DiscoveredAsset,
    dataset_key: str,
    region_code: str,
    resolved_ds: bool,
    region_error: str | None,
) -> ResolvedAsset:
    resolution_error = asset.resolution_error
    if region_error:
        resolution_error = region_error
    if not resolved_ds and not resolution_error:
        resolution_error = "unmapped_dataset"
    return ResolvedAsset(
        asset=asset,
        dataset_key=dataset_key,
        region_code=region_code,
        resolution_error=resolution_error,
        resolved_ds=resolved_ds,
    )


def _build_asset_record(
    asset: discover.DiscoveredAsset,
    dataset_key: str,
    region_code: str,
    resolution_error: str | None,
) -> dict[str, Any]:
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
