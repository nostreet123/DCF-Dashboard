from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

import pytest

from dcf_engine.service import sec_edgar
from dcf_engine.service.sec_edgar_cache import (
    CACHE_TTL_SECONDS,
    load_company_tickers as load_company_tickers_cached,
    ticker_cache_path,
)
from dcf_engine.service.sec_edgar_extract import (
    build_statements,
    combine_values,
    extract_annual_values,
)

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "sec_edgar"


def _load_fixture(name: str) -> dict[str, Any]:
    return json.loads((FIXTURE_DIR / name).read_text(encoding="utf-8"))


def test_cache_hit_uses_cached_payload_without_fetch(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("DCF_ENGINE_CACHE_DIR", str(tmp_path))
    payload = _load_fixture("company_tickers.json")
    cache_path = ticker_cache_path()
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(payload), encoding="utf-8")

    called = {"count": 0}

    def fake_fetch(_: str) -> dict[str, Any]:
        called["count"] += 1
        return payload

    entries = load_company_tickers_cached(fake_fetch, "https://example.test/tickers")

    assert called["count"] == 0
    assert len(entries) == 3
    assert entries[0]["ticker"] == "AAPL"


def test_cache_miss_fetches_and_writes_cache(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("DCF_ENGINE_CACHE_DIR", str(tmp_path))
    payload = _load_fixture("company_tickers.json")
    called = {"count": 0}

    def fake_fetch(_: str) -> dict[str, Any]:
        called["count"] += 1
        return payload

    entries = load_company_tickers_cached(fake_fetch, "https://example.test/tickers")

    assert called["count"] == 1
    assert len(entries) == 3
    assert ticker_cache_path().exists()
    written = json.loads(ticker_cache_path().read_text(encoding="utf-8"))
    assert written == payload


def test_stale_cache_fetches_fresh_payload(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("DCF_ENGINE_CACHE_DIR", str(tmp_path))
    stale_payload = {"0": {"cik_str": 1, "ticker": "OLD", "title": "Old Inc."}}
    fresh_payload = _load_fixture("company_tickers.json")

    cache_path = ticker_cache_path()
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(stale_payload), encoding="utf-8")
    old_timestamp = time.time() - CACHE_TTL_SECONDS - 5
    os.utime(cache_path, (old_timestamp, old_timestamp))

    called = {"count": 0}

    def fake_fetch(_: str) -> dict[str, Any]:
        called["count"] += 1
        return fresh_payload

    entries = load_company_tickers_cached(fake_fetch, "https://example.test/tickers")

    assert called["count"] == 1
    assert entries[0]["ticker"] == "AAPL"


def test_invalid_cache_payload_fetches_fresh_payload(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("DCF_ENGINE_CACHE_DIR", str(tmp_path))
    ticker_cache_path().parent.mkdir(parents=True, exist_ok=True)
    ticker_cache_path().write_text("[1, 2, 3]", encoding="utf-8")

    fresh_payload = _load_fixture("company_tickers.json")
    called = {"count": 0}

    def fake_fetch(_: str) -> dict[str, Any]:
        called["count"] += 1
        return fresh_payload

    entries = load_company_tickers_cached(fake_fetch, "https://example.test/tickers")

    assert called["count"] == 1
    assert len(entries) == 3


def test_extract_annual_values_prefers_latest_filing() -> None:
    facts = _load_fixture("company_facts_full.json")

    revenue = extract_annual_values(facts, "Revenues", ["USD"])

    assert sorted(revenue.keys()) == [2023, 2024]
    assert revenue[2024].value == 105.0
    assert revenue[2024].filed == "2025-02-20"


def test_debt_combination_sums_current_and_long_term() -> None:
    facts = _load_fixture("company_facts_full.json")

    debt_current = extract_annual_values(facts, "DebtCurrent", ["USD"])
    debt_long = extract_annual_values(facts, "LongTermDebtNoncurrent", ["USD"])
    combined = combine_values(debt_current, debt_long)

    assert combined[2024].value == 50.0
    assert combined[2024].filed == "2025-02-21"


def test_build_statements_falls_back_to_partial_payload_and_unexpected_units() -> None:
    facts = _load_fixture("company_facts_partial.json")

    statements = build_statements(facts, "MSFT")

    assert len(statements) == 2
    latest = statements[0]
    assert latest.period_end == "2023-12-31"
    assert latest.revenue is None
    assert latest.cash == 12.0
    assert latest.debt == 33.0
    assert latest.shares_outstanding == 7.0


def test_search_companies_filters_results_and_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = _load_fixture("company_tickers.json")
    entries = list(payload.values())
    monkeypatch.setattr(sec_edgar, "load_company_tickers", lambda: entries)

    results = sec_edgar.search_companies("inc", limit=2)

    assert len(results) == 2
    assert results[0].symbol == "AAPL"


def test_fetch_company_facts_raises_for_unknown_ticker(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(sec_edgar, "load_company_tickers", lambda: [])

    with pytest.raises(ValueError, match="Unknown ticker"):
        sec_edgar.fetch_company_facts("NOTREAL")


def test_fetch_company_facts_builds_company_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = _load_fixture("company_tickers.json")
    facts = _load_fixture("company_facts_full.json")
    monkeypatch.setattr(sec_edgar, "load_company_tickers", lambda: list(payload.values()))
    monkeypatch.setattr(sec_edgar, "get_json", lambda _: facts)

    company = sec_edgar.fetch_company_facts(" aapl ")

    assert company.symbol == "AAPL"
    assert company.cik == "0000320193"
    assert company.name == "Apple Inc."
    assert company.statements[0].revenue == 105.0
    assert company.statements[0].debt == 50.0
