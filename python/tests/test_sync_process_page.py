from __future__ import annotations

from copy import deepcopy
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest

from damodaran_sync import discover, download, excel_parse, mirror, sync, sync_upload, transform
from damodaran_sync.sync_discovery import resolve_assets_for_page
from damodaran_sync.convex_client import SnapshotUpsertResult
from damodaran_sync.download import DownloadResult


def _make_asset(
    *,
    source_url: str = "https://example.com/test_us_2024.xls",
    file_name: str = "test_us_2024.xls",
    as_of_date: str | None = "2024-01-01",
    page_type: str = "current",
) -> discover.DiscoveredAsset:
    return discover.DiscoveredAsset(
        source_page_url="https://example.com/page",
        page_type=page_type,
        page_last_updated="2024-01-01",
        source_url=source_url,
        file_name=file_name,
        link_label="Test Label",
        as_of_date=as_of_date,
        as_of_date_source="label",
        as_of_granularity="day",
        resolution_error=None,
    )


def _make_parsed_table() -> excel_parse.ParsedTable:
    return excel_parse.ParsedTable(
        sheet_name="Sheet1",
        header_row=0,
        column_names=["Industry", "Value"],
        rows=[["Software", 42.0]],
        row_count=1,
        sheet_candidates=["Sheet1"],
        skipped_sheets=[],
    )


def _make_transform_result() -> transform.TransformResult:
    rows = [
        transform.NormalizedRow(
            row_index=0,
            primary_key="Software",
            primary_key_norm="software",
            secondary_key=None,
            metrics={"Value": 42.0},
        )
    ]
    return transform.TransformResult(
        rows=rows,
        row_count=1,
        approx_bytes=100,
        max_row_bytes=100,
        storage_type="convex",
        external_row_count=None,
        external_byte_size=None,
        sample_strategy=None,
        sample_row_count=None,
        metrics_keys=["Value"],
    )


class _FakeClient:
    def __init__(self) -> None:
        self.events: list[str] = []
        self.increments: list[dict[str, int]] = []
        self.finished_statuses: list[str] = []
        self.appended_errors: list[tuple[str, str, str, str]] = []
        self.latest_manifest: dict[str, Any] | None = None
        self.snapshot_batch_results: list[dict[str, Any]] = []
        self.delete_counts: list[int] = [1, 0]
        self.manifest_upserts: list[tuple[str, str, str, int]] = []

    def clone(self) -> "_FakeClient":
        return self

    def get_reference(self) -> dict[str, Any]:
        return {
            "regions": [{"code": "us", "fileTokens": ["us"]}],
            "datasets": [{"key": "test_dataset", "dataType": "other"}],
            "datasetMappings": [
                {
                    "pattern": "test_us_2024",
                    "datasetKey": "test_dataset",
                    "isRegex": False,
                }
            ],
        }

    def create_sync_log(self, sync_type: str, page_last_updated: str | None = None) -> str:
        self.events.append("create_sync_log")
        return "log-1"

    def append_sync_error(self, sync_log_id: str, file: str, stage: str, error: str) -> None:
        self.appended_errors.append((sync_log_id, file, stage, error))

    def finish_sync_log(self, sync_log_id: str, status: str) -> None:
        self.events.append("finish_sync_log")
        self.finished_statuses.append(status)

    def increment_sync_log(self, sync_log_id: str, delta: dict[str, int]) -> None:
        self.events.append("increment_sync_log")
        self.increments.append(delta)

    def get_latest_manifest(self, page_type: str) -> dict[str, Any] | None:
        return self.latest_manifest

    def upsert_manifest(
        self, page_type: str, manifest_hash: str, source: str, item_count: int
    ) -> str:
        self.events.append("upsert_manifest")
        self.manifest_upserts.append((page_type, manifest_hash, source, item_count))
        return "manifest-1"

    def record_assets_batch(self, records: list[dict[str, Any]], chunk_size: int) -> None:
        self.events.append("record_assets_batch")

    def get_snapshots_by_identity_batch(
        self, identities: list[dict[str, str]]
    ) -> list[dict[str, Any]]:
        self.events.append("get_snapshots_by_identity_batch")
        return self.snapshot_batch_results

    def get_snapshot_by_identity(
        self, dataset_key: str, region_code: str, as_of_date: str
    ) -> dict[str, Any] | None:
        self.events.append("get_snapshot_by_identity")
        return None

    def record_asset(self, payload: dict[str, Any]) -> None:
        self.events.append("record_asset")

    def upsert_snapshot(
        self,
        dataset_key: str,
        region_code: str,
        as_of_date: str,
        build_id: str,
        metadata: dict[str, Any],
        *,
        force_rebuild: bool = False,
    ) -> SnapshotUpsertResult:
        self.events.append("upsert_snapshot")
        return SnapshotUpsertResult(
            snapshot_id="snapshot-1", action="updated", previous_build_id="build-old"
        )

    def insert_rows(self, snapshot_id: str, build_id: str, rows: list[dict[str, Any]]) -> int:
        self.events.append("insert_rows")
        return len(rows)

    def finalize_snapshot(self, snapshot_id: str, build_id: str, metadata: dict[str, Any]) -> None:
        self.events.append("finalize_snapshot")

    def delete_rows(self, snapshot_id: str, build_id: str, limit: int) -> int:
        self.events.append("delete_rows")
        if self.delete_counts:
            return self.delete_counts.pop(0)
        return 0


def _fake_download_result(asset: discover.DiscoveredAsset) -> DownloadResult:
    return DownloadResult(
        url=asset.source_url,
        path=Path("/tmp/test_us_2024.xls"),
        sha256="abc123",
        size_bytes=10,
        from_cache=False,
        etag=None,
        last_modified=None,
        not_modified=False,
    )


def _stub_asset_stages(monkeypatch, assets: list[discover.DiscoveredAsset]) -> None:
    download_res = _fake_download_result(assets[0])
    monkeypatch.setattr(sync, "run_download_stage", lambda *_args, **_kwargs: (download_res, 1))
    monkeypatch.setattr(
        sync,
        "parse_downloaded_asset",
        lambda _res, _timing: (_make_parsed_table(), 1),
    )
    monkeypatch.setattr(
        sync,
        "transform_parsed_asset",
        lambda _parsed, _timing: _make_transform_result(),
    )


def test_process_page_fast_exit_when_manifest_is_unchanged(monkeypatch) -> None:
    client = _FakeClient()
    assets = [_make_asset()]
    from damodaran_sync.sync_discovery import stable_manifest_hash

    manifest_hash = stable_manifest_hash(assets)
    client.latest_manifest = {"manifestHash": manifest_hash}

    monkeypatch.setenv("DAMODARAN_FAST_EXIT_IF_MANIFEST_UNCHANGED", "true")
    monkeypatch.setenv("DAMODARAN_SYNC_WORKERS", "1")

    discovery = discover.PageDiscovery(
        page_url="https://example.com/page",
        page_type="current",
        page_last_updated="2024-01-01",
        assets=assets,
    )
    monkeypatch.setattr(discover, "discover_page_assets", lambda *_args, **_kwargs: discovery)

    sync.process_page("https://example.com/page", "current", client)

    assert client.finished_statuses == ["success"]
    assert client.increments[0]["assetsDiscovered"] == 1
    assert client.increments[0]["assetsSkipped"] == 1
    assert "upsert_snapshot" not in client.events
    assert len(client.manifest_upserts) == 1


def test_process_page_runs_upsert_insert_finalize_cleanup(monkeypatch) -> None:
    client = _FakeClient()
    assets = [_make_asset()]

    monkeypatch.setenv("DAMODARAN_FAST_EXIT_IF_MANIFEST_UNCHANGED", "false")
    monkeypatch.setenv("DAMODARAN_SYNC_WORKERS", "1")
    monkeypatch.setenv("DAMODARAN_CONDITIONAL_GET", "true")

    discovery = discover.PageDiscovery(
        page_url="https://example.com/page",
        page_type="current",
        page_last_updated="2024-01-01",
        assets=assets,
    )
    monkeypatch.setattr(discover, "discover_page_assets", lambda *_args, **_kwargs: discovery)
    _stub_asset_stages(monkeypatch, assets)

    sync.process_page("https://example.com/page", "current", client)

    assert client.finished_statuses[-1] == "success"
    assert client.appended_errors == []
    expected_order = [
        "upsert_snapshot",
        "insert_rows",
        "finalize_snapshot",
        "delete_rows",
        "delete_rows",
    ]
    start = client.events.index("upsert_snapshot")
    assert client.events[start : start + len(expected_order)] == expected_order


def test_process_page_additive_only_skips_existing_ready_snapshot(monkeypatch) -> None:
    client = _FakeClient()
    assets = [_make_asset()]
    client.snapshot_batch_results = [
        {
            "datasetKey": "test_dataset",
            "regionCode": "us",
            "asOfDate": "2024-01-01",
            "activeBuildId": "build-1",
            "dataStatus": "ready",
        }
    ]

    monkeypatch.setenv("DAMODARAN_FAST_EXIT_IF_MANIFEST_UNCHANGED", "false")
    monkeypatch.setenv("DAMODARAN_SYNC_WORKERS", "1")

    discovery = discover.PageDiscovery(
        page_url="https://example.com/page",
        page_type="current",
        page_last_updated="2024-01-01",
        assets=assets,
    )
    monkeypatch.setattr(discover, "discover_page_assets", lambda *_args, **_kwargs: discovery)

    def _unexpected_download(*_args, **_kwargs):
        raise AssertionError("download_file should not run for additive-only existing snapshots")

    monkeypatch.setattr(download, "download_file", _unexpected_download)

    sync.process_page(
        "https://example.com/page",
        "current",
        client,
        additive_only=True,
    )

    assert "upsert_snapshot" not in client.events
    assert "insert_rows" not in client.events
    assert "finalize_snapshot" not in client.events
    assert "delete_rows" not in client.events
    assert client.finished_statuses[-1] == "success"
    assert client.increments[-1]["assetsSkipped"] == 1


def test_process_page_additive_only_processes_not_ready_snapshot(monkeypatch) -> None:
    client = _FakeClient()
    assets = [_make_asset()]
    client.snapshot_batch_results = [
        {
            "datasetKey": "test_dataset",
            "regionCode": "us",
            "asOfDate": "2024-01-01",
            "dataStatus": "rebuilding",
            "activeBuildId": None,
        }
    ]

    monkeypatch.setenv("DAMODARAN_FAST_EXIT_IF_MANIFEST_UNCHANGED", "false")
    monkeypatch.setenv("DAMODARAN_SYNC_WORKERS", "1")
    monkeypatch.setenv("DAMODARAN_CONDITIONAL_GET", "true")

    discovery = discover.PageDiscovery(
        page_url="https://example.com/page",
        page_type="current",
        page_last_updated="2024-01-01",
        assets=assets,
    )
    monkeypatch.setattr(discover, "discover_page_assets", lambda *_args, **_kwargs: discovery)
    _stub_asset_stages(monkeypatch, assets)

    sync.process_page(
        "https://example.com/page",
        "current",
        client,
        additive_only=True,
    )

    assert "upsert_snapshot" in client.events
    assert "insert_rows" in client.events


@pytest.mark.parametrize("workers", [1, 3], ids=["serial", "parallel"])
def test_process_page_skips_exact_duplicate_work(monkeypatch, workers: int) -> None:
    client = _FakeClient()
    first = _make_asset()
    second = replace(first, source_url="https://example.com/other/test_us_2024.xls")
    assets = [first, second, replace(first), replace(second), replace(first)]
    downloaded_assets: list[discover.DiscoveredAsset] = []
    parsed_urls: list[str] = []
    transformed_tables: list[excel_parse.ParsedTable] = []

    monkeypatch.delenv("DAMODARAN_MIRROR_MANIFEST_URL", raising=False)
    monkeypatch.delenv("DAMODARAN_SYNC_LIMIT", raising=False)
    monkeypatch.setenv("DAMODARAN_FAST_EXIT_IF_MANIFEST_UNCHANGED", "false")
    monkeypatch.setenv("DAMODARAN_SYNC_WORKERS", str(workers))
    discovery = discover.PageDiscovery(
        page_url="https://example.com/page",
        page_type="current",
        page_last_updated="2024-01-01",
        assets=assets,
    )
    monkeypatch.setattr(discover, "discover_page_assets", lambda *_args, **_kwargs: discovery)

    def download_stage(item, _client, **kwargs):
        downloaded_assets.append(item.asset)
        kwargs["outcome"].downloaded += 1
        return _fake_download_result(item.asset), 1

    def parse_stage(result, _timing):
        parsed_urls.append(result.url)
        return _make_parsed_table(), 1

    def transform_stage(parsed, _timing):
        transformed_tables.append(parsed)
        return _make_transform_result()

    monkeypatch.setattr(sync, "run_download_stage", download_stage)
    monkeypatch.setattr(sync, "parse_downloaded_asset", parse_stage)
    monkeypatch.setattr(sync, "transform_parsed_asset", transform_stage)

    sync.process_page("https://example.com/page", "current", client)

    assert len(downloaded_assets) == 2
    assert {id(asset) for asset in downloaded_assets} == {id(first), id(second)}
    if workers == 1:
        assert downloaded_assets[0] is first
        assert downloaded_assets[1] is second
    assert sorted(parsed_urls) == sorted([first.source_url, second.source_url])
    assert len(transformed_tables) == 2
    assert client.events.count("upsert_snapshot") == 2
    assert client.events.count("insert_rows") == 2
    assert client.events.count("finalize_snapshot") == 2
    assert client.increments[0] == {"assetsDiscovered": 5}
    assert client.increments[-1] == {
        "assetsDownloaded": 2,
        "assetsSkipped": 3,
        "rowsInserted": 2,
        "errorCount": 0,
    }
    assert client.manifest_upserts[0][3] == 5
    assert client.finished_statuses == ["success"]
    assert client.appended_errors == []


@pytest.mark.parametrize("workers", [1, 3], ids=["serial", "parallel"])
@pytest.mark.parametrize(
    "changes",
    [
        {"source_page_url": "https://example.com/another-page"},
        {"page_type": "archive"},
        {"page_last_updated": "2024-02-01"},
        {"source_url": "https://example.com/other/test_us_2024.xls"},
        {"file_name": "TEST_US_2024.xls"},
        {"link_label": "Other label"},
        {"link_label": "Europe"},
        {"as_of_date": "2024-02-01"},
        {"as_of_date_source": "filename"},
        {"as_of_granularity": "month"},
        {"resolution_error": "ambiguous_date"},
        {"allowed_host_hints": ("mirror.example.com",)},
    ],
    ids=[
        "source-page", "page-type", "page-update", "source-url", "file-name",
        "label", "region", "date", "date-source", "granularity", "error", "host-hints",
    ],
)
def test_process_page_keeps_distinct_work_identity(
    monkeypatch, workers: int, changes: dict[str, Any]
) -> None:
    client = _FakeClient()
    first = _make_asset()
    assets = [first, replace(first, **changes)]
    monkeypatch.delenv("DAMODARAN_MIRROR_MANIFEST_URL", raising=False)
    monkeypatch.delenv("DAMODARAN_SYNC_LIMIT", raising=False)
    monkeypatch.setenv("DAMODARAN_FAST_EXIT_IF_MANIFEST_UNCHANGED", "false")
    monkeypatch.setenv("DAMODARAN_SYNC_WORKERS", str(workers))
    discovery = discover.PageDiscovery(
        page_url="https://example.com/page",
        page_type="current",
        page_last_updated="2024-01-01",
        assets=assets,
    )
    monkeypatch.setattr(discover, "discover_page_assets", lambda *_args, **_kwargs: discovery)
    _stub_asset_stages(monkeypatch, assets)

    sync.process_page("https://example.com/page", "current", client)

    assert client.events.count("upsert_snapshot") == 2
    assert client.events.count("insert_rows") == 2
    assert client.events.count("finalize_snapshot") == 2
    assert client.increments[0] == {"assetsDiscovered": 2}
    assert client.increments[-1]["assetsSkipped"] == 0
    assert client.increments[-1]["rowsInserted"] == 2
    assert client.manifest_upserts[0][3] == 2
    assert client.finished_statuses == ["success"]
    assert client.appended_errors == []



def _parse_mirror_assets(monkeypatch, changes: list[dict[str, Any]]) -> list[discover.DiscoveredAsset]:
    monkeypatch.setattr(
        download.socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: [
            (download.socket.AF_INET, download.socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))
        ],
    )
    base = {
        "sourcePageUrl": "https://example.com/page",
        "pageType": "current",
        "pageLastUpdated": "2024-01-01",
        "downloadUrl": "/test_us_2024.xls",
        "fileName": "test_us_2024.xls",
        "linkLabel": "Test Label",
        "asOfDate": None,
        "asOfDateSource": "label",
        "asOfGranularity": "day",
    }
    return mirror._parse_manifest_payload(
        {"assets": [{**base, **change} for change in changes]},
        "https://mirror.example.com/manifest.json",
        "current",
    )


def test_resolve_assets_skips_exact_duplicates_before_resolution() -> None:
    client = _FakeClient()
    refs = client.get_reference()
    original_refs = deepcopy(refs)
    first = _make_asset()
    second = replace(first, source_url="https://example.com/other/test_us_2024.xls")

    class ResolutionTiming:
        def __init__(self) -> None:
            self.stages: list[str] = []

        def add_ms(self, stage: str, _elapsed: float) -> None:
            self.stages.append(stage)

    timing = ResolutionTiming()
    result = resolve_assets_for_page(
        [first, second, replace(first), replace(second), replace(first)],
        refs["datasetMappings"],
        {item["key"]: item for item in refs["datasets"]},
        refs["regions"],
        client,
        timing,
        100,
    )

    assert [item.asset for item in result] == [first, second]
    assert [(item.dataset_key, item.region_code) for item in result] == [
        ("test_dataset", "us"), ("test_dataset", "us")
    ]
    assert timing.stages == ["resolve_dataset", "resolve_region"] * 2
    assert refs == original_refs


@pytest.mark.parametrize(
    ("first_value", "second_value", "expected_work"),
    [
        ({"unit": "day", "parts": [1, True]}, {"parts": [1, True], "unit": "day"}, 1),
        (["day", "month"], ["month", "day"], 2),
        ({"parts": [True]}, {"parts": [1]}, 2),
        (True, 1, 2),
        (False, 0, 2),
        (1, 1.0, 2),
        (1, "1", 2),
        (None, "None", 2),
        (["day"], "['day']", 2),
        ({"unit": "day"}, "{'unit': 'day'}", 2),
    ],
    ids=[
        "object-key-order", "list-order", "nested-bool-int", "bool-int", "false-zero",
        "int-float", "int-string", "null-string", "list-string", "object-string",
    ],
)
def test_resolve_mirror_assets_preserves_json_work_identity(
    monkeypatch, first_value: Any, second_value: Any, expected_work: int
) -> None:
    assets = _parse_mirror_assets(
        monkeypatch,
        [{"asOfGranularity": first_value}, {"asOfGranularity": second_value}],
    )
    client = _FakeClient()
    refs = client.get_reference()

    result = resolve_assets_for_page(
        assets,
        refs["datasetMappings"],
        {item["key"]: item for item in refs["datasets"]},
        refs["regions"],
        client,
        None,
        100,
    )

    assert len(result) == expected_work
    assert result[0].asset is assets[0]
    if expected_work == 2:
        assert result[1].asset is assets[1]


@pytest.mark.parametrize("granularity", [{"unexpected": "value"}, ["unexpected"]], ids=["object", "list"])
def test_process_mirror_page_skips_undated_asset_with_structured_granularity(
    monkeypatch, granularity: Any
) -> None:
    assets = _parse_mirror_assets(monkeypatch, [{"asOfGranularity": granularity}] * 2)
    client = _FakeClient()
    monkeypatch.setenv("DAMODARAN_MIRROR_MANIFEST_URL", "https://mirror.example.com/manifest.json")
    monkeypatch.setenv("DAMODARAN_FAST_EXIT_IF_MANIFEST_UNCHANGED", "false")
    monkeypatch.setenv("DAMODARAN_SYNC_WORKERS", "1")
    monkeypatch.delenv("DAMODARAN_SYNC_LIMIT", raising=False)
    manifest = mirror.MirrorManifest("current", "mirror-manifest-hash", assets, "mirror")
    monkeypatch.setattr(mirror, "fetch_manifest", lambda *_args, **_kwargs: manifest)

    sync.process_page("https://example.com/page", "current", client)

    assert client.finished_statuses == ["success"]
    assert client.appended_errors == []
    assert client.increments[0] == {"assetsDiscovered": 2}
    assert client.increments[-1] == {
        "assetsDownloaded": 0, "assetsSkipped": 2, "rowsInserted": 0, "errorCount": 0
    }
    assert client.manifest_upserts[0][3] == 2
    assert "upsert_snapshot" not in client.events


@pytest.mark.parametrize("granularity", [{"unexpected": "value"}, ["unexpected"]], ids=["object", "list"])
def test_process_mirror_page_keeps_upload_error_local_to_asset(
    monkeypatch, granularity: Any
) -> None:
    assets = _parse_mirror_assets(
        monkeypatch,
        [
            {"asOfDate": "2024-01-01"},
            {
                "downloadUrl": "/other/test_us_2024.xls",
                "asOfDate": "2024-01-01",
                "asOfGranularity": granularity,
            },
        ],
    )

    class RejectInvalidGranularityClient(_FakeClient):
        def upsert_snapshot(self, *args, **kwargs):
            metadata = args[4]
            # Mirror the literal validator on convex/snapshots.ts SnapshotMetadata.
            if metadata["asOfGranularity"] not in ("day", "month"):
                raise ValueError("invalid asOfGranularity")
            return super().upsert_snapshot(*args, **kwargs)

    client = RejectInvalidGranularityClient()
    monkeypatch.setenv("DAMODARAN_MIRROR_MANIFEST_URL", "https://mirror.example.com/manifest.json")
    monkeypatch.setenv("DAMODARAN_FAST_EXIT_IF_MANIFEST_UNCHANGED", "false")
    monkeypatch.setenv("DAMODARAN_SYNC_WORKERS", "1")
    monkeypatch.delenv("DAMODARAN_SYNC_LIMIT", raising=False)
    manifest = mirror.MirrorManifest("current", "mirror-manifest-hash", assets, "mirror")
    monkeypatch.setattr(mirror, "fetch_manifest", lambda *_args, **_kwargs: manifest)
    _stub_asset_stages(monkeypatch, assets)

    sync.process_page("https://example.com/page", "current", client)

    assert client.finished_statuses == ["partial"]
    assert client.appended_errors == [
        ("log-1", "test_us_2024.xls", "upload", "ValueError: invalid asOfGranularity")
    ]
    assert client.events.count("upsert_snapshot") == 1
    assert client.events.count("insert_rows") == 1
    assert client.increments[0] == {"assetsDiscovered": 2}
    assert client.increments[-1]["rowsInserted"] == 1
    assert client.increments[-1]["errorCount"] == 1
    assert client.manifest_upserts[0][3] == 2
