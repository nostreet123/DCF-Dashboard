from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

import requests

from damodaran_sync.discover import DiscoveredAsset


@dataclass(frozen=True)
class MirrorManifest:
    page_type: str
    manifest_hash: str
    assets: list[DiscoveredAsset]
    source: str


def _hash_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _parse_manifest_payload(payload: dict[str, Any], base_url: str, page_type: str) -> list[DiscoveredAsset]:
    assets: list[DiscoveredAsset] = []
    raw_assets = payload.get("assets", [])
    if not isinstance(raw_assets, list):
        raise ValueError("Mirror manifest 'assets' must be a list")

    for item in raw_assets:
        if not isinstance(item, dict):
            continue
        item_page_type = item.get("pageType") or payload.get("pageType")
        if item_page_type and item_page_type != page_type:
            continue
        source_url = str(item.get("sourceUrl") or item.get("downloadUrl") or "")
        download_url = item.get("downloadUrl") or source_url
        if download_url:
            download_url = urljoin(base_url, str(download_url))
        if not source_url:
            source_url = download_url
        file_name = item.get("fileName")
        if not file_name:
            parsed = urlparse(download_url or source_url)
            file_name = Path(parsed.path).name
        assets.append(
            DiscoveredAsset(
                source_page_url=str(item.get("sourcePageUrl") or payload.get("sourcePageUrl") or base_url),
                page_type=page_type,
                page_last_updated=item.get("pageLastUpdated"),
                source_url=str(download_url or source_url),
                file_name=str(file_name),
                link_label=str(item.get("linkLabel") or ""),
                as_of_date=item.get("asOfDate"),
                as_of_date_source=item.get("asOfDateSource"),
                as_of_granularity=item.get("asOfGranularity"),
                resolution_error=item.get("resolutionError"),
            )
        )
    return assets


def fetch_manifest(manifest_url: str, page_type: str) -> MirrorManifest:
    response = requests.get(manifest_url, timeout=30)
    response.raise_for_status()
    raw_bytes = response.content
    manifest_hash = _hash_bytes(raw_bytes)
    payload = response.json()
    assets = _parse_manifest_payload(payload, manifest_url, page_type)
    return MirrorManifest(
        page_type=page_type,
        manifest_hash=manifest_hash,
        assets=assets,
        source=manifest_url,
    )
