from __future__ import annotations

from pathlib import Path
from typing import Any

from damodaran_sync import discover, excel_parse, sync, transform
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
                {"pattern": "test", "datasetKey": "test_dataset", "isRegex": False}
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


def test_process_page_fast_exit_when_manifest_is_unchanged(monkeypatch) -> None:
    client = _FakeClient()
    assets = [_make_asset()]
    manifest_hash = sync._stable_manifest_hash(assets)
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
    monkeypatch.setattr(
        sync.download,
        "download_file",
        lambda *_args, **_kwargs: DownloadResult(
            url=assets[0].source_url,
            path=Path("/tmp/test_us_2024.xls"),
            sha256="abc123",
            size_bytes=10,
            from_cache=False,
            etag=None,
            last_modified=None,
            not_modified=False,
        ),
    )
    monkeypatch.setattr(sync.excel_parse, "parse_excel", lambda _path: _make_parsed_table())
    monkeypatch.setattr(
        sync.transform, "transform_table", lambda _parsed: _make_transform_result()
    )

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
