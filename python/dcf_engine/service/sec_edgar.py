from __future__ import annotations

import time
from typing import Any

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
from dcf_engine.service.sec_edgar_models import (
    EdgarCompanyFacts,
    EdgarSearchResult,
    EdgarStatement,
)


def load_company_tickers() -> list[dict[str, Any]]:
    try:
        return load_company_tickers_cached(get_json, SEC_COMPANY_TICKERS_EXCHANGE_URL)
    except RuntimeError:
        return load_company_tickers_cached(get_json, SEC_COMPANY_TICKERS_URL)


def _normalize_ticker(ticker: str) -> str:
    return ticker.strip().upper()


def _pad_cik(value: int | str) -> str:
    return str(value).zfill(10)


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
    cik = _pad_cik(entry.get("cik_str") or entry.get("cik") or "")
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


def search_companies(query: str, limit: int = 10) -> list[EdgarSearchResult]:
    raw = query.strip()
    if not raw:
        return []

    entries = load_company_tickers()
    symbol_query = raw.upper()
    name_query = raw.lower()
    matches: list[EdgarSearchResult] = []
    for entry in entries:
        ticker = str(entry.get("ticker", "")).upper()
        title = str(entry.get("title") or entry.get("name") or "")
        if symbol_query not in ticker and name_query not in title.lower():
            continue
        matches.append(_search_result_from_entry(entry))
        if len(matches) >= limit:
            break

    return matches


def fetch_company_facts(symbol: str) -> EdgarCompanyFacts:
    tickers = load_company_tickers()
    normalized = _normalize_ticker(symbol)
    entry = next(
        (row for row in tickers if str(row.get("ticker", "")).upper() == normalized),
        None,
    )
    if entry is None:
        raise ValueError(f"Unknown ticker: {symbol}")

    cik = _pad_cik(entry.get("cik_str", ""))
    url = SEC_COMPANY_FACTS_URL.format(cik=cik)
    facts = get_json(url)
    statements = build_statements(facts, normalized)

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
