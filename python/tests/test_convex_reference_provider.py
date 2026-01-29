from __future__ import annotations

from dcf_engine.reference import convex_provider
from dcf_engine.reference.provider import SnapshotRef


class DummyConvexClient:
    last_instance = None

    def __init__(self, url: str) -> None:
        self.url = url
        self.queries: list[tuple[str, dict]] = []
        DummyConvexClient.last_instance = self

    def query(self, name: str, args: dict):
        self.queries.append((name, args))
        if name == "reference:getLatestSnapshot":
            return {
                "snapshotId": "snap1",
                "datasetKey": args["datasetKey"],
                "regionCode": args["regionCode"],
                "asOfDate": "2026-01-09",
                "activeBuildId": "build1",
                "columnNames": [],
                "metricsKeys": [],
            }
        if name == "reference:getSnapshotAtOrBefore":
            return {
                "snapshotId": "snap2",
                "datasetKey": args["datasetKey"],
                "regionCode": args["regionCode"],
                "asOfDate": args["targetDate"],
                "activeBuildId": "build2",
                "columnNames": [],
                "metricsKeys": [],
            }
        if name == "reference:getRow":
            return {
                "snapshot": {
                    "snapshotId": "snap3",
                    "datasetKey": args["datasetKey"],
                    "regionCode": args["regionCode"],
                    "asOfDate": "2026-01-09",
                    "activeBuildId": "build3",
                    "columnNames": [],
                    "metricsKeys": [],
                },
                "row": {
                    "primaryKeyNorm": args["primaryKeyNorm"],
                    "secondaryKey": args.get("secondaryKey"),
                    "metrics": {"WACC": 0.1},
                },
            }
        return None


def test_convex_reference_provider_queries(monkeypatch):
    monkeypatch.setattr(convex_provider, "ConvexClient", DummyConvexClient)
    provider = convex_provider.ConvexReferenceProvider(convex_url="http://example")

    snapshot = provider.get_latest_snapshot("wacc", "us")
    assert isinstance(snapshot, SnapshotRef)

    snapshot = provider.get_snapshot_at_or_before("wacc", "us", "2026-01-09")
    assert isinstance(snapshot, SnapshotRef)

    row = provider.get_row("wacc", "us", "2026-01-09", "software")
    assert row is not None

    assert DummyConvexClient.last_instance is not None
    assert DummyConvexClient.last_instance.queries[0][0] == "reference:getLatestSnapshot"
    assert DummyConvexClient.last_instance.queries[1][0] == "reference:getSnapshotAtOrBefore"
    assert DummyConvexClient.last_instance.queries[2][0] == "reference:getRow"
