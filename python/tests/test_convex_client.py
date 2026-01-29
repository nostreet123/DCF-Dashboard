from __future__ import annotations

from damodaran_sync import convex_client


class DummyConvexClient:
    last_instance = None

    def __init__(self, url: str) -> None:
        self.url = url
        self.queries: list[tuple[str, dict]] = []
        self.mutations: list[tuple[str, dict]] = []
        DummyConvexClient.last_instance = self

    def query(self, name: str, args: dict) -> dict:
        self.queries.append((name, args))
        return {"regions": [], "datasets": [], "datasetMappings": []}

    def mutation(self, name: str, args: dict) -> str:
        self.mutations.append((name, args))
        return "ok"


def test_get_reference_authenticated(monkeypatch) -> None:
    monkeypatch.setattr(convex_client, "ConvexClient", DummyConvexClient)
    client = convex_client.ConvexSyncClient(
        convex_url="http://example",
        sync_token="secret-token",
    )

    result = client.get_reference()

    assert result == {"regions": [], "datasets": [], "datasetMappings": []}
    assert DummyConvexClient.last_instance is not None
    assert DummyConvexClient.last_instance.queries == [
        ("seed:getReference", {})
    ]


def test_sync_log_idempotency_args(monkeypatch) -> None:
    monkeypatch.setattr(convex_client, "ConvexClient", DummyConvexClient)
    client = convex_client.ConvexSyncClient(
        convex_url="http://example",
        sync_token="secret-token",
    )

    client.create_sync_log("full_current")
    client.increment_sync_log("log-1", {"assetsDiscovered": 1})
    client.append_sync_error(
        "log-1",
        "file.csv",
        "download",
        "boom",
    )

    assert DummyConvexClient.last_instance is not None
    mutations = DummyConvexClient.last_instance.mutations
    assert mutations[0][0] == "syncLogs:create"
    assert "requestId" not in mutations[0][1]
    assert mutations[1][0] == "syncLogs:increment"
    assert "eventId" not in mutations[1][1]
    assert mutations[2][0] == "syncErrors:append"
    assert "eventId" not in mutations[2][1]
