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


def test_get_reference_unauthenticated(monkeypatch) -> None:
    monkeypatch.setattr(convex_client, "ConvexClient", DummyConvexClient)
    client = convex_client.ConvexSyncClient(
        convex_url="http://example",
        sync_token="secret-token",
    )

    result = client.get_reference()

    assert result == {"regions": [], "datasets": [], "datasetMappings": []}
    assert DummyConvexClient.last_instance is not None
    assert DummyConvexClient.last_instance.queries == [("seed:getReference", {})]
