from __future__ import annotations

import importlib
import json
import hashlib
import hmac
import time
import uuid
import pytest
import requests
from fastapi.testclient import TestClient

from dcf_engine.service import app as service_app

client = TestClient(service_app.app)


def _valid_dcf_payload() -> dict[str, object]:
    scenario = {
        "revenueGrowth": 0.08,
        "ebitMargin": 0.2,
        "taxRate": 0.25,
        "salesToCapital": 2.0,
        "wacc": 0.1,
        "gStable": 0.03,
        "waccStable": 0.09,
    }
    return {
        "baseYear": 2025,
        "periods": 10,
        "revenueT0": 1000.0,
        "cash": 100.0,
        "debt": 80.0,
        "otherNonOperatingAssets": 10.0,
        "sharesOutstanding": 100.0,
        "reinvestmentLagYears": 0,
        "base": scenario,
        "bull": scenario,
        "bear": scenario,
    }


@pytest.fixture(autouse=True)
def _allow_unsigned_engine_requests(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DCF_ENGINE_ALLOW_UNSIGNED", "1")


def test_sec_search_wraps_requests_exception(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def raise_requests_error(_: str, limit: int = 10):
        raise requests.RequestException("network failure")

    monkeypatch.setattr(service_app, "search_companies", raise_requests_error)

    response = client.get("/sec/search", params={"q": "AAPL", "limit": 10})
    assert response.status_code == 500
    assert response.json()["detail"] == service_app.SEC_SEARCH_FAILURE_DETAIL


def test_sec_facts_wraps_requests_exception(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def raise_requests_error(_: str):
        raise requests.RequestException("timeout")

    monkeypatch.setattr(service_app, "fetch_company_facts", raise_requests_error)

    response = client.get("/sec/facts", params={"symbol": "AAPL"})
    assert response.status_code == 500
    assert response.json()["detail"] == service_app.SEC_FACTS_FAILURE_DETAIL


def test_sec_facts_keeps_not_found_mapping(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def raise_unknown_ticker(_: str):
        raise ValueError("Unknown ticker: BAD")

    monkeypatch.setattr(service_app, "fetch_company_facts", raise_unknown_ticker)

    response = client.get("/sec/facts", params={"symbol": "BAD"})
    assert response.status_code == 404
    assert response.json()["detail"] == service_app.SEC_FACTS_NOT_FOUND_DETAIL


def test_dcf_compute_hides_value_error_details(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def raise_value_error(_: object) -> object:
        raise ValueError("sensitive detail")

    monkeypatch.setattr(service_app, "run_workbench", raise_value_error)

    response = client.post("/dcf/compute", json=_valid_dcf_payload())
    assert response.status_code == 400
    assert response.json()["detail"] == service_app.DCF_COMPUTE_BAD_REQUEST_DETAIL


def test_dcf_compute_hides_runtime_error_details(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def raise_runtime_error(_: object) -> object:
        raise RuntimeError("engine internals")

    monkeypatch.setattr(service_app, "run_workbench", raise_runtime_error)

    response = client.post("/dcf/compute", json=_valid_dcf_payload())
    assert response.status_code == 500
    assert response.json()["detail"] == service_app.DCF_COMPUTE_FAILURE_DETAIL


def test_dcf_compute_serializes_scenario_assumptions_with_camel_case_keys() -> None:
    response = client.post("/dcf/compute", json=_valid_dcf_payload())
    assert response.status_code == 200
    assumptions = response.json()["base"]["assumptions"]
    assert "revenueGrowth" in assumptions
    assert "revenue_growth" not in assumptions


class _SharedSecurityClientStub:
    reserve_should_succeed = True
    mark_should_succeed = True
    rate_limit_sequence: list[dict[str, object]] = []
    calls: list[tuple[str, tuple[object, ...]]] = []
    init_count = 0
    fail_init = False
    fail_calls = False

    def __init__(self) -> None:
        type(self).init_count += 1
        if self.fail_init:
            raise ValueError("Service not configured")

    @classmethod
    def reset(cls) -> None:
        cls.reserve_should_succeed = True
        cls.mark_should_succeed = True
        cls.rate_limit_sequence = []
        cls.calls = []
        cls.init_count = 0
        cls.fail_init = False
        cls.fail_calls = False

    def reserve_nonce(self, nonce: str, ttl_ms: int) -> bool:
        self.calls.append(("reserve_nonce", (nonce, ttl_ms)))
        if self.fail_calls:
            raise RuntimeError("backend unavailable")
        return self.reserve_should_succeed

    def mark_nonce_used(self, nonce: str, ttl_ms: int) -> bool:
        self.calls.append(("mark_nonce_used", (nonce, ttl_ms)))
        if self.fail_calls:
            raise RuntimeError("backend unavailable")
        return self.mark_should_succeed

    def release_pending_nonce(self, nonce: str) -> None:
        self.calls.append(("release_pending_nonce", (nonce,)))
        if self.fail_calls:
            raise RuntimeError("backend unavailable")

    def hit_rate_limit_bucket(
        self,
        bucket_key: str,
        limit: int,
        window_ms: int,
    ) -> dict[str, object]:
        self.calls.append(("hit_rate_limit_bucket", (bucket_key, limit, window_ms)))
        if self.fail_calls:
            raise RuntimeError("backend unavailable")
        if self.rate_limit_sequence:
            return self.rate_limit_sequence.pop(0)
        return {"allowed": True, "retry_after_seconds": None}


@pytest.fixture(autouse=True)
def _stub_shared_security_client(monkeypatch: pytest.MonkeyPatch) -> None:
    _SharedSecurityClientStub.reset()
    service_app._rate_limit_security_client.cache_clear()
    monkeypatch.setattr(service_app, "ConvexSecurityStateClient", _SharedSecurityClientStub)
    internal_auth = importlib.import_module("dcf_engine.service.internal_auth")
    internal_auth._shared_security_client.cache_clear()
    monkeypatch.setattr(
        internal_auth,
        "ConvexSecurityStateClient",
        _SharedSecurityClientStub,
    )


def _signed_headers(secret: str, method: str, url: str, body: str = "") -> dict[str, str]:
    timestamp_ms = str(int(time.time() * 1000))
    nonce = str(uuid.uuid4())
    body_hash = hashlib.sha256(body.encode("utf-8")).hexdigest()
    payload = f"{method.upper()}\n{url}\n{timestamp_ms}\n{nonce}\n{body_hash}"
    signature = hmac.new(
        secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return {
        "x-dcf-internal-signature": signature,
        "x-dcf-internal-ts": timestamp_ms,
        "x-dcf-internal-nonce": nonce,
    }


def _reload_service_app() -> object:
    return importlib.reload(service_app)


def test_dcf_compute_rate_limit_ignores_xff_by_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _SharedSecurityClientStub.rate_limit_sequence = [
        {"allowed": True, "retry_after_seconds": None},
        {"allowed": False, "retry_after_seconds": 60},
    ]
    monkeypatch.delenv("DCF_TRUSTED_PROXY_MODE", raising=False)
    monkeypatch.delenv("DCF_TRUSTED_PROXY_CIDRS", raising=False)
    direct_client = TestClient(service_app.app, client=("198.51.100.10", 50000))

    first = direct_client.post(
        "/dcf/compute",
        json=_valid_dcf_payload(),
        headers={"x-forwarded-for": "203.0.113.1"},
    )
    second = direct_client.post(
        "/dcf/compute",
        json=_valid_dcf_payload(),
        headers={"x-forwarded-for": "203.0.113.2"},
    )

    assert first.status_code == 200
    assert second.status_code == 429


def test_dcf_compute_fails_closed_when_unsigned_mode_is_not_enabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DCF_ENGINE_ALLOW_UNSIGNED", raising=False)
    monkeypatch.delenv("DCF_ENGINE_INTERNAL_KEY", raising=False)

    response = client.post("/dcf/compute", json=_valid_dcf_payload())

    assert response.status_code == 503
    assert response.json()["detail"] == "Service not configured"


def test_dcf_compute_rate_limit_uses_xff_for_trusted_proxy_allowlist(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _SharedSecurityClientStub.rate_limit_sequence = [
        {"allowed": True, "retry_after_seconds": None},
        {"allowed": True, "retry_after_seconds": None},
    ]
    monkeypatch.setenv("DCF_TRUSTED_PROXY_MODE", "allowlist")
    monkeypatch.setenv("DCF_TRUSTED_PROXY_CIDRS", "198.51.100.10/32")
    proxy_client = TestClient(service_app.app, client=("198.51.100.10", 50000))

    first = proxy_client.post(
        "/dcf/compute",
        json=_valid_dcf_payload(),
        headers={"x-forwarded-for": "203.0.113.1"},
    )
    second = proxy_client.post(
        "/dcf/compute",
        json=_valid_dcf_payload(),
        headers={"x-forwarded-for": "203.0.113.2"},
    )

    assert first.status_code == 200
    assert second.status_code == 200


def test_dcf_compute_rate_limit_rejects_xff_from_untrusted_proxy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _SharedSecurityClientStub.rate_limit_sequence = [
        {"allowed": True, "retry_after_seconds": None},
        {"allowed": False, "retry_after_seconds": 60},
    ]
    monkeypatch.setenv("DCF_TRUSTED_PROXY_MODE", "allowlist")
    monkeypatch.setenv("DCF_TRUSTED_PROXY_CIDRS", "198.51.100.99/32")
    untrusted_client = TestClient(service_app.app, client=("198.51.100.10", 50000))

    first = untrusted_client.post(
        "/dcf/compute",
        json=_valid_dcf_payload(),
        headers={"x-forwarded-for": "203.0.113.1"},
    )
    second = untrusted_client.post(
        "/dcf/compute",
        json=_valid_dcf_payload(),
        headers={"x-forwarded-for": "203.0.113.2"},
    )

    assert first.status_code == 200
    assert second.status_code == 429


def test_dcf_compute_rate_limit_uses_leftmost_ip_for_multi_hop_xff(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _SharedSecurityClientStub.rate_limit_sequence = [
        {"allowed": True, "retry_after_seconds": None},
        {"allowed": False, "retry_after_seconds": 60},
    ]
    monkeypatch.setenv("DCF_TRUSTED_PROXY_MODE", "allowlist")
    monkeypatch.setenv("DCF_TRUSTED_PROXY_CIDRS", "198.51.100.10/32")
    proxy_client = TestClient(service_app.app, client=("198.51.100.10", 50000))

    first = proxy_client.post(
        "/dcf/compute",
        json=_valid_dcf_payload(),
        headers={"x-forwarded-for": "203.0.113.10, 198.51.100.70"},
    )
    second = proxy_client.post(
        "/dcf/compute",
        json=_valid_dcf_payload(),
        headers={"x-forwarded-for": "203.0.113.10, 198.51.100.71"},
    )

    assert first.status_code == 200
    assert second.status_code == 429


def test_dcf_compute_rate_limit_falls_back_on_malformed_xff(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _SharedSecurityClientStub.rate_limit_sequence = [
        {"allowed": True, "retry_after_seconds": None},
        {"allowed": False, "retry_after_seconds": 60},
    ]
    monkeypatch.setenv("DCF_TRUSTED_PROXY_MODE", "allowlist")
    monkeypatch.setenv("DCF_TRUSTED_PROXY_CIDRS", "198.51.100.10/32")
    proxy_client = TestClient(service_app.app, client=("198.51.100.10", 50000))

    first = proxy_client.post(
        "/dcf/compute",
        json=_valid_dcf_payload(),
        headers={"x-forwarded-for": "not-an-ip"},
    )
    second = proxy_client.post(
        "/dcf/compute",
        json=_valid_dcf_payload(),
        headers={"x-forwarded-for": "still-not-an-ip"},
    )

    assert first.status_code == 200
    assert second.status_code == 429


def test_sec_search_requires_signed_internal_auth_when_engine_key_is_set(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DCF_ENGINE_INTERNAL_KEY", "engine-secret")
    response = client.get("/sec/search", params={"q": "AAPL", "limit": 10})
    assert response.status_code == 401


def test_sec_search_accepts_valid_signed_internal_auth(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DCF_ENGINE_INTERNAL_KEY", "engine-secret")

    def search(_: str, limit: int = 10):
        return [{"symbol": "AAPL", "name": "Apple", "cik": "0000320193"}]

    monkeypatch.setattr(service_app, "search_companies", search)
    headers = _signed_headers(
        "engine-secret",
        "GET",
        "/sec/search?q=AAPL&limit=10",
    )
    response = client.get("/sec/search", params={"q": "AAPL", "limit": 10}, headers=headers)
    assert response.status_code == 200
    assert response.json()["results"][0]["symbol"] == "AAPL"


def test_sec_facts_requires_signed_internal_auth_when_engine_key_is_set(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DCF_ENGINE_INTERNAL_KEY", "engine-secret")
    response = client.get("/sec/facts", params={"symbol": "AAPL"})
    assert response.status_code == 401


def test_dcf_compute_requires_signed_internal_auth_when_engine_key_is_set(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DCF_ENGINE_INTERNAL_KEY", "engine-secret")
    response = client.post("/dcf/compute", json=_valid_dcf_payload())
    assert response.status_code == 401


def test_dcf_compute_rejects_replayed_nonce_when_engine_key_is_set(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DCF_ENGINE_INTERNAL_KEY", "engine-secret")
    body = _valid_dcf_payload()
    encoded = json.dumps(body)
    headers = _signed_headers("engine-secret", "POST", "/dcf/compute", encoded)
    first = client.post("/dcf/compute", data=encoded, headers=headers | {"content-type": "application/json"})
    _SharedSecurityClientStub.reserve_should_succeed = False
    second = client.post("/dcf/compute", data=encoded, headers=headers | {"content-type": "application/json"})
    assert first.status_code == 200
    assert second.status_code == 401


def test_dcf_compute_rejects_invalid_signature_without_shared_nonce_mutations(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DCF_ENGINE_INTERNAL_KEY", "engine-secret")
    body = _valid_dcf_payload()
    encoded = json.dumps(body)
    headers = _signed_headers("engine-secret", "POST", "/dcf/compute", encoded)
    headers["x-dcf-internal-signature"] = "wrong"

    response = client.post(
        "/dcf/compute",
        data=encoded,
        headers=headers | {"content-type": "application/json"},
    )

    assert response.status_code == 401
    assert not any(
        call[0] in {"reserve_nonce", "mark_nonce_used", "release_pending_nonce"}
        for call in _SharedSecurityClientStub.calls
    )


def test_signed_mode_requires_convex_security_state_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DCF_ENGINE_INTERNAL_KEY", "engine-secret")
    _SharedSecurityClientStub.fail_init = True
    encoded = json.dumps(_valid_dcf_payload())
    headers = _signed_headers("engine-secret", "POST", "/dcf/compute", encoded)

    response = client.post(
        "/dcf/compute",
        data=encoded,
        headers=headers | {"content-type": "application/json"},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "Service not configured"


def test_signed_mode_reports_security_backend_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DCF_ENGINE_INTERNAL_KEY", "engine-secret")
    _SharedSecurityClientStub.fail_calls = True
    encoded = json.dumps(_valid_dcf_payload())
    headers = _signed_headers("engine-secret", "POST", "/dcf/compute", encoded)

    response = client.post(
        "/dcf/compute",
        data=encoded,
        headers=headers | {"content-type": "application/json"},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "Security backend unavailable"


def test_dcf_compute_rate_limit_returns_503_when_backend_is_unavailable_even_if_unsigned_mode_is_enabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DCF_ENGINE_ALLOW_UNSIGNED", "1")
    monkeypatch.setenv("DCF_ENGINE_INTERNAL_KEY", "engine-secret")

    class _AuthSecurityClientStub(_SharedSecurityClientStub):
        pass

    class _RateLimitFailingSecurityClientStub(_SharedSecurityClientStub):
        def hit_rate_limit_bucket(
            self,
            bucket_key: str,
            limit: int,
            window_ms: int,
        ) -> dict[str, object]:
            raise RuntimeError("backend unavailable")

    internal_auth = importlib.import_module("dcf_engine.service.internal_auth")
    monkeypatch.setattr(
        internal_auth,
        "ConvexSecurityStateClient",
        _AuthSecurityClientStub,
    )
    monkeypatch.setattr(
        service_app,
        "ConvexSecurityStateClient",
        _RateLimitFailingSecurityClientStub,
    )

    encoded = json.dumps(_valid_dcf_payload())
    response = client.post(
        "/dcf/compute",
        data=encoded,
        headers=_signed_headers("engine-secret", "POST", "/dcf/compute", encoded)
        | {"content-type": "application/json"},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == service_app.SECURITY_BACKEND_UNAVAILABLE_DETAIL


def test_dcf_compute_rate_limit_reuses_cached_security_client() -> None:
    first = client.post("/dcf/compute", json=_valid_dcf_payload())
    second = client.post("/dcf/compute", json=_valid_dcf_payload())

    assert first.status_code == 200
    assert second.status_code == 200
    assert _SharedSecurityClientStub.init_count == 1


def test_dcf_compute_rate_limit_caps_request_limit_to_backend_max(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(service_app, "_MAX_REQUESTS", 15_000)

    response = client.post("/dcf/compute", json=_valid_dcf_payload())

    assert response.status_code == 200
    assert any(
        call[0] == "hit_rate_limit_bucket" and call[1][1] == 10_000
        for call in _SharedSecurityClientStub.calls
    )


def test_dcf_compute_rate_limit_caps_window_to_one_hour(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DCF_ENGINE_INTERNAL_KEY", "engine-secret")
    monkeypatch.setattr(service_app, "_WINDOW_SECONDS", 99_999.0)
    _SharedSecurityClientStub.rate_limit_sequence = [
        {"allowed": True, "retry_after_seconds": None},
    ]

    encoded = json.dumps(_valid_dcf_payload())
    response = client.post(
        "/dcf/compute",
        data=encoded,
        headers=_signed_headers("engine-secret", "POST", "/dcf/compute", encoded)
        | {"content-type": "application/json"},
    )

    assert response.status_code == 200
    rate_limit_calls = [
        call for call in _SharedSecurityClientStub.calls if call[0] == "hit_rate_limit_bucket"
    ]
    assert rate_limit_calls
    _, (_, _, window_ms) = rate_limit_calls[0]
    assert window_ms == 3_600_000


def test_dcf_compute_rate_limit_caps_infinite_window_to_one_hour(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DCF_ENGINE_INTERNAL_KEY", "engine-secret")
    monkeypatch.setattr(service_app, "_WINDOW_SECONDS", float("inf"))
    _SharedSecurityClientStub.rate_limit_sequence = [
        {"allowed": True, "retry_after_seconds": None},
    ]
    test_client = TestClient(service_app.app, raise_server_exceptions=False)

    encoded = json.dumps(_valid_dcf_payload())
    response = test_client.post(
        "/dcf/compute",
        data=encoded,
        headers=_signed_headers("engine-secret", "POST", "/dcf/compute", encoded)
        | {"content-type": "application/json"},
    )

    assert response.status_code == 200
    rate_limit_calls = [
        call for call in _SharedSecurityClientStub.calls if call[0] == "hit_rate_limit_bucket"
    ]
    assert rate_limit_calls
    _, (_, _, window_ms) = rate_limit_calls[0]
    assert window_ms == 3_600_000


def test_unsigned_local_mode_skips_shared_rate_limit_backend_when_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DCF_ENGINE_ALLOW_UNSIGNED", "1")
    _SharedSecurityClientStub.fail_calls = True

    response = client.post("/dcf/compute", json=_valid_dcf_payload())

    assert response.status_code == 200


def test_fastapi_docs_disabled_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DCF_ENGINE_EXPOSE_DOCS", raising=False)
    reloaded = _reload_service_app()
    reloaded_client = TestClient(reloaded.app)
    assert reloaded_client.get("/docs").status_code == 404
    assert reloaded_client.get("/redoc").status_code == 404
    assert reloaded_client.get("/openapi.json").status_code == 404


def test_fastapi_docs_enabled_with_explicit_opt_in(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DCF_ENGINE_EXPOSE_DOCS", "1")
    reloaded = _reload_service_app()
    reloaded_client = TestClient(reloaded.app)
    assert reloaded_client.get("/docs").status_code == 200
    assert reloaded_client.get("/redoc").status_code == 200
    assert reloaded_client.get("/openapi.json").status_code == 200
