from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

from damodaran_sync.discover import DiscoveredAsset
from damodaran_sync.download import HttpClient, _validate_response_peer, validate_download_url

DEFAULT_MAX_MANIFEST_BYTES = 2 * 1024 * 1024


@dataclass(frozen=True)
class MirrorManifest:
    page_type: str
    manifest_hash: str
    assets: list[DiscoveredAsset]
    source: str


def _hash_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _env_int(name: str, default: int) -> int:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    try:
        value = int(raw_value)
    except ValueError:
        return default
    return value if value > 0 else default


def _read_response_content_with_limit(response) -> bytes:
    max_bytes = _env_int("DAMODARAN_MIRROR_MANIFEST_MAX_BYTES", DEFAULT_MAX_MANIFEST_BYTES)
    content_length = response.headers.get("Content-Length")
    if content_length is not None:
        try:
            parsed_length = int(content_length)
        except ValueError:
            parsed_length = 0
        if parsed_length > max_bytes:
            raise ValueError(f"Mirror manifest exceeded maximum size of {max_bytes} bytes")
    chunks: list[bytes] = []
    size = 0
    for chunk in response.iter_content(chunk_size=1024 * 1024):
        if not chunk:
            continue
        size += len(chunk)
        if size > max_bytes:
            raise ValueError(f"Mirror manifest exceeded maximum size of {max_bytes} bytes")
        chunks.append(chunk)
    return b"".join(chunks)


def _parse_manifest_payload(payload: dict[str, Any], base_url: str, page_type: str) -> list[DiscoveredAsset]:
    assets: list[DiscoveredAsset] = []
    raw_assets = payload.get("assets", [])
    if not isinstance(raw_assets, list):
        raise ValueError("Mirror manifest 'assets' must be a list")

    base_host = urlparse(base_url).hostname
    extra_allowed_hosts = {base_host} if base_host else set()
    for item in raw_assets:
        if not isinstance(item, dict):
            continue
        item_page_type = item.get("pageType") or payload.get("pageType")
        if item_page_type and item_page_type != page_type:
            continue
        source_url = str(item.get("sourceUrl") or item.get("downloadUrl") or "")
        download_url = item.get("downloadUrl") or source_url
        if not source_url and not download_url:
            continue
        if download_url:
            download_url = urljoin(base_url, str(download_url))
            download_url = validate_download_url(
                download_url,
                extra_allowed_hosts=extra_allowed_hosts,
            )
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
                allowed_host_hints=tuple(sorted(extra_allowed_hosts)),
            )
        )
    return assets


def fetch_manifest(
    manifest_url: str,
    page_type: str,
    http_client: HttpClient | None = None,
) -> MirrorManifest:
    manifest_host = urlparse(manifest_url).hostname
    validated_manifest_url = validate_download_url(
        manifest_url,
        extra_allowed_hosts={manifest_host} if manifest_host else None,
    )
    client = http_client or HttpClient(timeout=30)
    response = client.get(
        validated_manifest_url,
        stream=True,
        allow_redirects=False,
    )
    response_close = getattr(response, "close", None)
    try:
        _validate_response_peer(response, validated_manifest_url)
        if 300 <= response.status_code < 400:
            raise ValueError(f"Mirror manifest redirects are not allowed: {validated_manifest_url}")
        response.raise_for_status()
        raw_bytes = _read_response_content_with_limit(response)
        manifest_hash = _hash_bytes(raw_bytes)
        payload = json.loads(raw_bytes)
        assets = _parse_manifest_payload(payload, validated_manifest_url, page_type)
    finally:
        if response_close is not None:
            response_close()
    return MirrorManifest(
        page_type=page_type,
        manifest_hash=manifest_hash,
        assets=assets,
        source=validated_manifest_url,
    )
