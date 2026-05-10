from __future__ import annotations

from damodaran_sync import discover
from damodaran_sync.sync import _stable_manifest_hash


def _asset(
    *,
    source_page_url: str = "https://example.com/page",
    page_type: str = "current",
    page_last_updated: str | None = "2026-01-02",
    source_url: str = "https://example.com/a.xls",
    file_name: str = "a.xls",
    link_label: str = "A",
    as_of_date: str | None = "2026-01-01",
    as_of_date_source: str | None = "label",
    as_of_granularity: str | None = "day",
    resolution_error: str | None = None,
) -> discover.DiscoveredAsset:
    return discover.DiscoveredAsset(
        source_page_url=source_page_url,
        page_type=page_type,
        page_last_updated=page_last_updated,
        source_url=source_url,
        file_name=file_name,
        link_label=link_label,
        as_of_date=as_of_date,
        as_of_date_source=as_of_date_source,
        as_of_granularity=as_of_granularity,
        resolution_error=resolution_error,
    )


def test_stable_manifest_hash_is_deterministic() -> None:
    assets = [_asset(), _asset(source_url="https://example.com/b.xls", file_name="b.xls")]
    first = _stable_manifest_hash(assets)
    second = _stable_manifest_hash(assets)
    assert first == second


def test_stable_manifest_hash_is_order_independent() -> None:
    asset_a = _asset()
    asset_b = _asset(source_url="https://example.com/b.xls", file_name="b.xls")
    assert _stable_manifest_hash([asset_a, asset_b]) == _stable_manifest_hash([asset_b, asset_a])


def test_stable_manifest_hash_ties_are_deterministic() -> None:
    # Two assets can share the old sort key (source_url, file_name, link_label, as_of_date)
    # but differ in other fields that are included in the hash.
    asset_a = _asset(page_type="current")
    asset_b = _asset(page_type="archive")
    assert _stable_manifest_hash([asset_a, asset_b]) == _stable_manifest_hash([asset_b, asset_a])


def test_stable_manifest_hash_changes_on_asset_change() -> None:
    assets = [_asset()]
    baseline = _stable_manifest_hash(assets)
    changed = _stable_manifest_hash([_asset(file_name="a2.xls")])
    assert baseline != changed


def test_stable_manifest_hash_handles_none_fields() -> None:
    assets = [
        _asset(
            page_last_updated=None,
            as_of_date=None,
            as_of_date_source=None,
            as_of_granularity=None,
        )
    ]
    baseline = _stable_manifest_hash(assets)
    assert baseline == _stable_manifest_hash(assets)


def test_stable_manifest_hash_ignores_resolution_error() -> None:
    asset_ok = _asset(resolution_error=None)
    asset_err = _asset(resolution_error="unparseable_date")
    assert _stable_manifest_hash([asset_ok]) == _stable_manifest_hash([asset_err])
