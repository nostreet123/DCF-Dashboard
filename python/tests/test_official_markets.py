from __future__ import annotations

import pytest

from dcf_engine.service import official_markets
from dcf_engine.service.sec_edgar_models import (
    EdgarCompanyFacts,
    EdgarSearchResult,
    EdgarStatement,
)


@pytest.fixture(autouse=True)
def clear_sec_coverage_cache() -> None:
    official_markets._cached_sec_company_facts.cache_clear()


def test_sec_search_marks_missing_shares_as_import_required(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        official_markets,
        "search_companies",
        lambda query, limit: [
            EdgarSearchResult(
                symbol="BRK-A",
                name="BERKSHIRE HATHAWAY INC",
                cik="0001067983",
                canonical_id="0001067983",
                listing_id="XNYS:BRK-A",
                exchange="New York Stock Exchange",
                mic="XNYS",
                coverage_state="import_required",
            )
        ],
    )
    monkeypatch.setattr(
        official_markets,
        "fetch_company_facts",
        lambda symbol: EdgarCompanyFacts(
            symbol=symbol,
            name="BERKSHIRE HATHAWAY INC",
            cik="0001067983",
            currency="USD",
            updated_at=1,
            statements=[
                EdgarStatement(period_end="2025-12-31", revenue=100.0, shares_outstanding=None)
            ],
        ),
    )

    results = official_markets.SECAdapter().search("BRK-A", limit=1)

    assert results[0].id == "XNYS:BRK-A"
    assert results[0].exchange_mic == "XNYS"
    assert results[0].market == "New York Stock Exchange"
    assert results[0].coverage_state == "import_required"
    assert "Import reviewed statements" in (results[0].coverage_reason or "")


def test_sec_search_marks_complete_company_as_valuation_ready(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        official_markets,
        "search_companies",
        lambda query, limit: [
            EdgarSearchResult(
                symbol="NVDA",
                name="NVIDIA CORP",
                cik="0001045810",
                canonical_id="0001045810",
                listing_id="XNAS:NVDA",
                mic="XNAS",
            )
        ],
    )
    monkeypatch.setattr(
        official_markets,
        "fetch_company_facts",
        lambda symbol: EdgarCompanyFacts(
            symbol=symbol,
            name="NVIDIA CORP",
            cik="0001045810",
            currency="USD",
            updated_at=1,
            statements=[
                EdgarStatement(
                    period_end="2025-12-31",
                    revenue=100.0,
                    shares_outstanding=10.0,
                )
            ],
        ),
    )

    results = official_markets.SECAdapter().search("NVDA", limit=1)

    assert results[0].coverage_state == "valuation_ready"


def test_sec_search_checks_companyfacts_for_dropdown_results(monkeypatch) -> None:
    monkeypatch.setattr(
        official_markets,
        "search_companies",
        lambda query, limit: [
            EdgarSearchResult(
                symbol="BRKH",
                name="BurTech Acquisition Corp.",
                cik="0001019742",
                canonical_id="0001019742",
                listing_id="XNAS:BRKH",
                mic="XNAS",
            )
        ],
    )
    monkeypatch.setattr(
        official_markets,
        "fetch_company_facts",
        lambda symbol: EdgarCompanyFacts(
            symbol=symbol,
            name="BurTech Acquisition Corp.",
            cik="0001019742",
            currency="USD",
            updated_at=1,
            statements=[],
        ),
    )

    results = official_markets.SECAdapter().search("brk", limit=1)

    assert results[0].symbol == "BRKH"
    assert results[0].coverage_state == "import_required"


def test_sec_search_caps_companyfacts_coverage_checks(monkeypatch) -> None:
    monkeypatch.setattr(official_markets, "SEC_SEARCH_COVERAGE_LOOKUP_LIMIT", 3)
    monkeypatch.setattr(
        official_markets,
        "search_companies",
        lambda query, limit: [
            EdgarSearchResult(
                symbol=f"A{index}",
                name=f"Company {index}",
                cik=f"{index:010d}",
                canonical_id=f"{index:010d}",
                listing_id=f"XNAS:A{index}",
                mic="XNAS",
            )
            for index in range(limit)
        ],
    )
    fetched_symbols: list[str] = []

    def fetch_facts(symbol: str) -> EdgarCompanyFacts:
        fetched_symbols.append(symbol)
        return EdgarCompanyFacts(
            symbol=symbol,
            name=symbol,
            cik="0000000000",
            currency="USD",
            updated_at=1,
            statements=[
                EdgarStatement(
                    period_end="2025-12-31",
                    revenue=100.0,
                    shares_outstanding=10.0,
                )
            ],
        )

    monkeypatch.setattr(official_markets, "fetch_company_facts", fetch_facts)

    results = official_markets.SECAdapter().search("a", limit=5)

    assert fetched_symbols == ["A0", "A1", "A2"]
    assert [result.coverage_state for result in results[:3]] == [
        "valuation_ready",
        "valuation_ready",
        "valuation_ready",
    ]
    assert [result.coverage_state for result in results[3:]] == [
        "detail_only",
        "detail_only",
    ]
    assert results[3].coverage_reason == official_markets.SEC_SEARCH_DEFERRED_COVERAGE_REASON


def test_sec_companyfacts_cache_expires_by_ttl_bucket(monkeypatch) -> None:
    calls: list[str] = []

    def fetch_facts(symbol: str) -> EdgarCompanyFacts:
        calls.append(symbol)
        return EdgarCompanyFacts(
            symbol=symbol,
            name=symbol,
            cik="0000000000",
            currency="USD",
            updated_at=len(calls),
            statements=[
                EdgarStatement(
                    period_end="2025-12-31",
                    revenue=100.0,
                    shares_outstanding=10.0,
                )
            ],
        )

    monkeypatch.setattr(official_markets, "SEC_FACTS_CACHE_TTL_SECONDS", 10)
    monkeypatch.setattr(official_markets.time, "time", lambda: 100.0)
    monkeypatch.setattr(official_markets, "fetch_company_facts", fetch_facts)

    assert official_markets._cached_sec_company_facts("AAPL").updated_at == 1
    assert official_markets._cached_sec_company_facts("AAPL").updated_at == 1
    monkeypatch.setattr(official_markets.time, "time", lambda: 111.0)
    assert official_markets._cached_sec_company_facts("AAPL").updated_at == 2
    assert calls == ["AAPL", "AAPL"]


def _raise_unexpected_facts_fetch(symbol: str) -> EdgarCompanyFacts:
    raise AssertionError(f"unexpected SEC facts fetch for {symbol}")


def test_official_search_prioritizes_ticker_root_matches(monkeypatch) -> None:
    class FakeAdapter:
        def search(self, query: str, limit: int):
            return [
                official_markets.CompanySearchResult(
                    id="XNAS:BRKR",
                    symbol="BRKR",
                    name="BRUKER CORP",
                    exchangeMic="XNAS",
                    market="United States",
                    country="US",
                    currency="USD",
                    coverageState="valuation_ready",
                    coverageReason="ready",
                    sourceLinks=[],
                ),
                official_markets.CompanySearchResult(
                    id="XNAS:BRK-B",
                    symbol="BRK-B",
                    name="BERKSHIRE HATHAWAY INC",
                    exchangeMic="XNAS",
                    market="United States",
                    country="US",
                    currency="USD",
                    coverageState="valuation_ready",
                    coverageReason="ready",
                    sourceLinks=[],
                ),
                official_markets.CompanySearchResult(
                    id="XNAS:BRK-A",
                    symbol="BRK-A",
                    name="BERKSHIRE HATHAWAY INC",
                    exchangeMic="XNAS",
                    market="United States",
                    country="US",
                    currency="USD",
                    coverageState="valuation_ready",
                    coverageReason="ready",
                    sourceLinks=[],
                ),
            ]

        def detail(self, listing_id: str):
            return None

    monkeypatch.setattr(official_markets, "ADAPTERS", [FakeAdapter()])

    results = official_markets.search_official_companies("brk", limit=3)

    assert [result.symbol for result in results] == ["BRK-A", "BRK-B", "BRKR"]


def test_official_detail_preserves_requested_non_sec_listing(monkeypatch) -> None:
    def fail_if_sec_lookup_runs(symbol: str) -> EdgarCompanyFacts:
        raise AssertionError(f"unexpected SEC lookup for {symbol}")

    monkeypatch.setattr(official_markets, "fetch_company_facts", fail_if_sec_lookup_runs)

    detail = official_markets.fetch_official_detail("XTSE:SHOP")

    assert detail.id == "XTSE:SHOP"
    assert detail.exchange_mic == "XTSE"
    assert detail.market == "Toronto Stock Exchange"


def test_official_detail_preserves_requested_sec_exchange(monkeypatch) -> None:
    monkeypatch.setattr(
        official_markets,
        "fetch_company_facts",
        lambda symbol: EdgarCompanyFacts(
            symbol=symbol,
            name="International Business Machines Corp.",
            cik="0000051143",
            currency="USD",
            updated_at=1,
            statements=[
                EdgarStatement(
                    period_end="2025-12-31",
                    revenue=100.0,
                    shares_outstanding=10.0,
                )
            ],
        ),
    )

    detail = official_markets.fetch_official_detail("XNYS:IBM")

    assert detail.id == "XNYS:IBM"
    assert detail.exchange_mic == "XNYS"


def test_official_search_keeps_static_markets_when_sec_search_fails(monkeypatch) -> None:
    def fail_sec_search(query: str, limit: int):
        raise RuntimeError("SEC unavailable")

    monkeypatch.setattr(official_markets, "search_companies", fail_sec_search)

    results = official_markets.search_official_companies("TLV", limit=5)

    assert results
    assert results[0].id == "XBSE:TLV"


def test_sec_detail_outage_is_retryable(monkeypatch) -> None:
    def fail_sec_facts(symbol: str) -> EdgarCompanyFacts:
        raise RuntimeError("SEC unavailable")

    monkeypatch.setattr(official_markets, "fetch_company_facts", fail_sec_facts)

    try:
        official_markets.fetch_official_detail("XNAS:AAPL")
    except RuntimeError as exc:
        assert "SEC unavailable" in str(exc)
    else:
        raise AssertionError("expected retryable SEC outage")
