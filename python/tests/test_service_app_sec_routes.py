from __future__ import annotations

import importlib
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


def _install_single_request_limiter(monkeypatch: pytest.MonkeyPatch) -> None:
    limiter = service_app._WindowRateLimiter(max_requests=1, window_seconds=60.0)
    monkeypatch.setattr(service_app, "_compute_rate_limiter", limiter)


def _signed_headers(secret: str, method: str, url: str, body: str = "") -> dict[str, str]:
    import hashlib
    import hmac
    import uuid
    import time

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
    _install_single_request_limiter(monkeypatch)
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


def test_dcf_compute_rate_limit_uses_xff_for_trusted_proxy_allowlist(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_single_request_limiter(monkeypatch)
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
    _install_single_request_limiter(monkeypatch)
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
    _install_single_request_limiter(monkeypatch)
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
    _install_single_request_limiter(monkeypatch)
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
    import json

    encoded = json.dumps(body)
    headers = _signed_headers("engine-secret", "POST", "/dcf/compute", encoded)
    first = client.post("/dcf/compute", data=encoded, headers=headers | {"content-type": "application/json"})
    second = client.post("/dcf/compute", data=encoded, headers=headers | {"content-type": "application/json"})
    assert first.status_code == 200
    assert second.status_code == 401


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
