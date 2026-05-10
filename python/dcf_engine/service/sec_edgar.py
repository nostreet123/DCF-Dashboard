from __future__ import annotations

import time
from typing import Any

import requests

from dcf_engine.service.sec_edgar_cache import load_company_tickers as load_company_tickers_cached
from dcf_engine.service.sec_edgar_extract import (
    build_statements,
    combine_values,
    extract_annual_values,
    select_unit,
)
from dcf_engine.service.sec_edgar_http import (
    SEC_COMPANY_FACTS_URL,
    SEC_COMPANY_TICKERS_EXCHANGE_URL,
    SEC_COMPANY_TICKERS_URL,
    TransientHttpError,
    get_json,
)
from dcf_engine.service.sec_filing_shares import fetch_berkshire_equivalent_class_a_shares
from dcf_engine.service.sec_edgar_models import (
    EdgarCompanyFacts,
    EdgarSearchResult,
    EdgarStatement,
)


def load_company_tickers() -> list[dict[str, Any]]:
    try:
        return load_company_tickers_cached(
            get_json,
            SEC_COMPANY_TICKERS_EXCHANGE_URL,
            cache_key="exchange",
        )
    except (RuntimeError, TransientHttpError, requests.RequestException):
        return load_company_tickers_cached(
            get_json,
            SEC_COMPANY_TICKERS_URL,
            cache_key="legacy",
        )


def _normalize_ticker(ticker: str) -> str:
    return ticker.strip().upper()


def _pad_cik(value: int | str) -> str:
    return str(value).zfill(10)


def _extract_cik_entry(entry: dict[str, Any]) -> str:
    cik = entry.get("cik_str")
    if cik is None or cik == "":
        cik = entry.get("cik")
    return _pad_cik(cik or "")


def _normalized_exchange(entry: dict[str, Any]) -> str | None:
    exchange = str(entry.get("exchange") or "").strip()
    return exchange or None


def _mic_for_exchange(exchange: str | None) -> str | None:
    if not exchange:
        return None
    normalized = exchange.upper()
    if normalized in {"NASDAQ", "NASDAQ GLOBAL SELECT"}:
        return "XNAS"
    if normalized in {"NYSE", "NEW YORK STOCK EXCHANGE"}:
        return "XNYS"
    if normalized in {"NYSE ARCA", "ARCA"}:
        return "ARCX"
    if normalized in {"NYSE AMERICAN", "AMEX"}:
        return "XASE"
    return None


def _sec_browse_url(cik: str) -> str:
    return f"https://www.sec.gov/edgar/browse/?CIK={cik}"


def _search_result_from_entry(entry: dict[str, Any]) -> EdgarSearchResult:
    ticker = str(entry.get("ticker", "")).upper()
    title = str(entry.get("title") or entry.get("name") or ticker)
    cik = _extract_cik_entry(entry)
    exchange = _normalized_exchange(entry)
    mic = _mic_for_exchange(exchange)
    listing_id = f"{mic}:{ticker}" if mic else ticker
    return EdgarSearchResult(
        symbol=ticker,
        name=title,
        cik=cik,
        canonical_id=cik,
        listing_id=listing_id,
        exchange=exchange,
        mic=mic,
        country_code="US",
        coverage_state="valuation_ready",
        detail_url=_sec_browse_url(cik),
    )


def _search_rank(ticker: str, title: str, symbol_query: str, name_query: str) -> tuple[int, str]:
    ticker_lower = ticker.lower()
    ticker_root = ticker.split("-", 1)[0].split(".", 1)[0]
    if ticker == symbol_query:
        return (0, ticker)
    if ticker_root == symbol_query:
        return (1, ticker)
    if ticker.startswith(symbol_query):
        return (2, ticker)
    if ticker_lower.startswith(name_query):
        return (3, ticker)
    if symbol_query in ticker:
        return (4, ticker)
    if title.lower().startswith(name_query):
        return (5, ticker)
    return (6, ticker)


def search_companies(query: str, limit: int = 10) -> list[EdgarSearchResult]:
    raw = query.strip()
    if not raw:
        return []

    entries = load_company_tickers()
    symbol_query = raw.upper()
    name_query = raw.lower()
    ranked_matches: list[tuple[tuple[int, str], EdgarSearchResult]] = []
    for entry in entries:
        ticker = str(entry.get("ticker", "")).upper()
        title = str(entry.get("title") or entry.get("name") or "")
        if symbol_query not in ticker and name_query not in title.lower():
            continue
        result = _search_result_from_entry(entry)
        ranked_matches.append((_search_rank(ticker, title, symbol_query, name_query), result))

    ranked_matches.sort(key=lambda match: match[0])
    return [result for _, result in ranked_matches[:limit]]


def fetch_company_facts(symbol: str) -> EdgarCompanyFacts:
    tickers = load_company_tickers()
    normalized = _normalize_ticker(symbol)
    entry = next(
        (row for row in tickers if str(row.get("ticker", "")).upper() == normalized),
        None,
    )
    if entry is None:
        raise ValueError(f"Unknown ticker: {symbol}")

    cik = _extract_cik_entry(entry)
    url = SEC_COMPANY_FACTS_URL.format(cik=cik)
    facts = get_json(url)
    statements = build_statements(facts, normalized)
    if (
        normalized in {"BRK-A", "BRK-B"}
        and statements
        and statements[0].shares_outstanding is None
    ):
        class_a_equivalent_shares = fetch_berkshire_equivalent_class_a_shares(cik)
        if class_a_equivalent_shares is not None:
            if normalized == "BRK-B":
                statements[0].shares_outstanding = class_a_equivalent_shares * 1500
            else:
                statements[0].shares_outstanding = class_a_equivalent_shares

    return EdgarCompanyFacts(
        symbol=normalized,
        name=entry.get("title"),
        cik=cik,
        currency="USD",
        source="edgar",
        updated_at=int(time.time() * 1000),
        statements=statements,
    )


# Compatibility aliases for existing internal tests/tools.
_get_json = get_json
_select_unit = select_unit
_extract_annual_values = extract_annual_values
_combine_values = combine_values
_build_statements = build_statements

__all__ = [
    "EdgarCompanyFacts",
    "EdgarSearchResult",
    "EdgarStatement",
    "TransientHttpError",
    "fetch_company_facts",
    "load_company_tickers",
    "search_companies",
]
