from __future__ import annotations

import pytest

from dcf_engine.service import convex_security


class DummyConvexClient:
    last_instance = None

    def __init__(self, url: str) -> None:
        self.url = url
        self.mutations: list[tuple[str, dict]] = []
        DummyConvexClient.last_instance = self

    def mutation(self, name: str, args: dict):
        self.mutations.append((name, args))
        if name == "securityAuth:reserveNonce":
            return {"reserved": True}
        if name == "securityAuth:markNonceUsed":
            return {"marked": True}
        if name == "securityAuth:releasePendingNonce":
            return {"released": 1}
        if name == "securityRateLimit:hitBucket":
            return {"allowed": False, "retryAfterSeconds": 42}
        raise AssertionError(f"Unexpected mutation {name}")


class ExplodingConvexClient:
    def __init__(self, url: str) -> None:
        raise Exception(f"bad convex url: {url}")


class FailingConvexClient:
    last_instance = None

    def __init__(self, url: str) -> None:
        self.url = url
        self.mutations: list[tuple[str, dict]] = []
        FailingConvexClient.last_instance = self

    def mutation(self, name: str, args: dict):
        self.mutations.append((name, args))
        raise TimeoutError("transient failure")


def test_convex_security_client_requires_convex_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("CONVEX_URL", raising=False)
    monkeypatch.setenv("DAMODARAN_SYNC_TOKEN", "test-token")

    with pytest.raises(ValueError, match="CONVEX_URL"):
        convex_security.ConvexSecurityStateClient()


def test_convex_security_client_requires_sync_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CONVEX_URL", "http://example")
    monkeypatch.delenv("DAMODARAN_SYNC_TOKEN", raising=False)

    with pytest.raises(ValueError, match="DAMODARAN_SYNC_TOKEN"):
        convex_security.ConvexSecurityStateClient()


def test_convex_security_client_wraps_initialization_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(convex_security, "ConvexClient", ExplodingConvexClient)
    monkeypatch.setenv("CONVEX_URL", "http://example")
    monkeypatch.setenv("DAMODARAN_SYNC_TOKEN", "test-token")

    with pytest.raises(RuntimeError, match="failed to initialize"):
        convex_security.ConvexSecurityStateClient()


def test_convex_security_client_uses_expected_convex_mutations(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(convex_security, "ConvexClient", DummyConvexClient)
    monkeypatch.setenv("CONVEX_URL", "http://example")
    monkeypatch.setenv("DAMODARAN_SYNC_TOKEN", "test-token")

    client = convex_security.ConvexSecurityStateClient()

    assert client.reserve_nonce("nonce-1", 300_000) is True
    assert client.mark_nonce_used("nonce-1", 300_000) is True
    client.release_pending_nonce("nonce-2")
    result = client.hit_rate_limit_bucket("bucket-1", 5, 60_000)

    assert result["allowed"] is False
    assert result["retry_after_seconds"] == 42
    assert DummyConvexClient.last_instance is not None
    mutation_names = [name for name, _ in DummyConvexClient.last_instance.mutations]
    assert mutation_names == [
        "securityAuth:reserveNonce",
        "securityAuth:markNonceUsed",
        "securityAuth:releasePendingNonce",
        "securityRateLimit:hitBucket",
    ]
    for _, args in DummyConvexClient.last_instance.mutations:
        assert args["syncToken"] == "test-token"


def test_convex_security_client_keeps_class_sync_token_over_args(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(convex_security, "ConvexClient", DummyConvexClient)
    monkeypatch.setenv("CONVEX_URL", "http://example")
    monkeypatch.setenv("DAMODARAN_SYNC_TOKEN", "test-token")

    client = convex_security.ConvexSecurityStateClient()
    client._mutation(
        "securityAuth:reserveNonce",
        {
            "syncToken": "attacker-token",
            "nonce": "nonce-1",
            "ttlMs": 300_000,
        },
    )

    assert DummyConvexClient.last_instance is not None
    _, args = DummyConvexClient.last_instance.mutations[0]
    assert args["syncToken"] == "test-token"


@pytest.mark.parametrize(
    ("method_name", "method_args", "operation_name"),
    [
        ("reserve_nonce", ("nonce-1", 300_000), "securityAuth:reserveNonce"),
        ("mark_nonce_used", ("nonce-1", 300_000), "securityAuth:markNonceUsed"),
        ("release_pending_nonce", ("nonce-1",), "securityAuth:releasePendingNonce"),
        (
            "hit_rate_limit_bucket",
            ("bucket-1", 5, 60_000),
            "securityRateLimit:hitBucket",
        ),
    ],
)
def test_convex_security_client_does_not_retry_mutations(
    monkeypatch: pytest.MonkeyPatch,
    method_name: str,
    method_args: tuple[object, ...],
    operation_name: str,
) -> None:
    monkeypatch.setattr(convex_security, "ConvexClient", FailingConvexClient)
    monkeypatch.setenv("CONVEX_URL", "http://example")
    monkeypatch.setenv("DAMODARAN_SYNC_TOKEN", "test-token")

    client = convex_security.ConvexSecurityStateClient()
    method = getattr(client, method_name)

    with pytest.raises(RuntimeError, match=operation_name):
        method(*method_args)

    assert FailingConvexClient.last_instance is not None
    assert len(FailingConvexClient.last_instance.mutations) == 1
