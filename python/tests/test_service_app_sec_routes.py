from __future__ import annotations

import pytest
import requests
from fastapi import HTTPException

from dcf_engine.service import app as service_app


def test_sec_search_wraps_requests_exception(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def raise_requests_error(_: str, limit: int = 10):
        raise requests.RequestException("network failure")

    monkeypatch.setattr(service_app, "search_companies", raise_requests_error)

    with pytest.raises(HTTPException) as exc_info:
        service_app.sec_search(q="AAPL", limit=10)

    assert exc_info.value.status_code == 500
    assert "network failure" in str(exc_info.value.detail)


def test_sec_facts_wraps_requests_exception(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def raise_requests_error(_: str):
        raise requests.RequestException("timeout")

    monkeypatch.setattr(service_app, "fetch_company_facts", raise_requests_error)

    with pytest.raises(HTTPException) as exc_info:
        service_app.sec_facts(symbol="AAPL")

    assert exc_info.value.status_code == 500
    assert "timeout" in str(exc_info.value.detail)


def test_sec_facts_keeps_not_found_mapping(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def raise_unknown_ticker(_: str):
        raise ValueError("Unknown ticker: BAD")

    monkeypatch.setattr(service_app, "fetch_company_facts", raise_unknown_ticker)

    with pytest.raises(HTTPException) as exc_info:
        service_app.sec_facts(symbol="BAD")

    assert exc_info.value.status_code == 404
    assert "Unknown ticker" in str(exc_info.value.detail)
