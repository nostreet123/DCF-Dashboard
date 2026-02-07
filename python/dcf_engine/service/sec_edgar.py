from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests
from pydantic import BaseModel, Field
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

logger = logging.getLogger(__name__)

SEC_COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
SEC_COMPANY_FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
CACHE_TTL_SECONDS = 24 * 60 * 60


class TransientHttpError(RuntimeError):
    def __init__(self, status_code: int, url: str) -> None:
        super().__init__(f"Transient HTTP error {status_code} for {url}")
        self.status_code = status_code
        self.url = url


class EdgarSearchResult(BaseModel):
    symbol: str = Field(..., description="Ticker symbol.")
    name: str = Field(..., description="Company name.")
    cik: str = Field(..., description="10-digit CIK.")


class EdgarStatement(BaseModel):
    period_end: str = Field(..., description="Period end date (YYYY-MM-DD).")
    period_type: str = Field("FY", description="Period type.")
    filing_date: str | None = Field(None, description="Filing date.")
    currency: str | None = Field(None, description="Currency code.")
    revenue: float | None = Field(None, description="Annual revenue.")
    cash: float | None = Field(None, description="Cash and equivalents.")
    debt: float | None = Field(None, description="Total debt.")
    shares_outstanding: float | None = Field(
        None, description="Shares outstanding."
    )
    source: str = Field("edgar", description="Data source.")


class EdgarCompanyFacts(BaseModel):
    symbol: str = Field(..., description="Ticker symbol.")
    name: str | None = Field(None, description="Company name.")
    cik: str = Field(..., description="10-digit CIK.")
    currency: str | None = Field(None, description="Reporting currency.")
    source: str = Field("edgar", description="Data source.")
    updated_at: int = Field(..., description="Updated timestamp (ms).")
    statements: list[EdgarStatement] = Field(
        default_factory=list, description="Annual statements."
    )


@dataclass(frozen=True)
class AnnualValue:
    fy: int
    value: float
    end: str | None
    filed: str | None


def _sec_headers() -> dict[str, str]:
    user_agent = os.getenv("SEC_USER_AGENT")
    if not user_agent:
        raise RuntimeError("SEC_USER_AGENT environment variable is required")
    return {
        "User-Agent": user_agent,
        "Accept-Encoding": "gzip, deflate",
        "Accept": "application/json",
    }


@retry(
    retry=retry_if_exception_type((requests.RequestException, TransientHttpError)),
    wait=wait_exponential(multiplier=1, min=1, max=20),
    stop=stop_after_attempt(5),
    reraise=True,
)
def _get_json(url: str) -> dict[str, Any]:
    response = requests.get(url, headers=_sec_headers(), timeout=30)
    if response.status_code == 429 or response.status_code >= 500:
        raise TransientHttpError(response.status_code, url)
    response.raise_for_status()
    return response.json()


def _cache_dir() -> Path:
    raw = os.getenv("DCF_ENGINE_CACHE_DIR")
    if raw:
        return Path(raw)
    return Path.home() / ".cache" / "dcf_engine"


def _ticker_cache_path() -> Path:
    return _cache_dir() / "company_tickers.json"


def _load_cached_tickers() -> list[dict[str, Any]] | None:
    path = _ticker_cache_path()
    if not path.exists():
        return None
    age_seconds = time.time() - path.stat().st_mtime
    if age_seconds > CACHE_TTL_SECONDS:
        return None
    try:
        with path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict):
        return None
    return list(payload.values())


def _write_ticker_cache(payload: dict[str, Any]) -> None:
    path = _ticker_cache_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle)


def load_company_tickers() -> list[dict[str, Any]]:
    cached = _load_cached_tickers()
    if cached is not None:
        return cached
    payload = _get_json(SEC_COMPANY_TICKERS_URL)
    if not isinstance(payload, dict):
        raise RuntimeError("Unexpected response from SEC company tickers endpoint")
    _write_ticker_cache(payload)
    return list(payload.values())


def _normalize_ticker(ticker: str) -> str:
    return ticker.strip().upper()


def _pad_cik(value: int | str) -> str:
    return str(value).zfill(10)


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
        title = str(entry.get("title", ""))
        if symbol_query not in ticker and name_query not in title.lower():
            continue
        cik = _pad_cik(entry.get("cik_str", ""))
        matches.append(
            EdgarSearchResult(symbol=ticker, name=title, cik=cik),
        )
        if len(matches) >= limit:
            break
    return matches


def _select_unit(units: dict[str, list[dict[str, Any]]], preferred: list[str]) -> list[dict[str, Any]]:
    for key in preferred:
        if key in units:
            return units[key]
    if not units:
        return []
    return next(iter(units.values()))


def _extract_annual_values(
    facts: dict[str, Any],
    tag: str,
    preferred_units: list[str],
    taxonomy: str = "us-gaap",
) -> dict[int, AnnualValue]:
    tag_data = facts.get("facts", {}).get(taxonomy, {}).get(tag)
    if not tag_data:
        return {}
    units = tag_data.get("units", {})
    entries = _select_unit(units, preferred_units)
    by_year: dict[int, AnnualValue] = {}
    for entry in entries:
        fy = entry.get("fy")
        if fy is None:
            continue
        if entry.get("fp") != "FY":
            continue
        value = entry.get("val")
        if value is None:
            continue
        try:
            numeric_value = float(value)
        except (TypeError, ValueError):
            continue
        end = entry.get("end")
        filed = entry.get("filed")
        current = by_year.get(int(fy))
        if current is None or (filed and (current.filed or "") < filed):
            by_year[int(fy)] = AnnualValue(
                fy=int(fy),
                value=numeric_value,
                end=end,
                filed=filed,
            )
    return by_year


def _combine_values(
    current: dict[int, AnnualValue],
    long_term: dict[int, AnnualValue],
) -> dict[int, AnnualValue]:
    combined: dict[int, AnnualValue] = {}
    years = set(current.keys()) | set(long_term.keys())
    for year in years:
        current_value = current.get(year)
        long_value = long_term.get(year)
        total = (current_value.value if current_value else 0.0) + (
            long_value.value if long_value else 0.0
        )
        end = (
            (long_value.end if long_value else None)
            or (current_value.end if current_value else None)
        )
        filed_candidates = [
            value.filed for value in (current_value, long_value) if value and value.filed
        ]
        filed = max(filed_candidates) if filed_candidates else None
        combined[year] = AnnualValue(fy=year, value=total, end=end, filed=filed)
    return combined


def _build_statements(
    facts: dict[str, Any],
    symbol: str,
) -> list[EdgarStatement]:
    revenue = _extract_annual_values(
        facts,
        "Revenues",
        ["USD"],
    )
    if not revenue:
        revenue = _extract_annual_values(
            facts,
            "SalesRevenueNet",
            ["USD"],
        )

    cash = _extract_annual_values(
        facts,
        "CashAndCashEquivalentsAtCarryingValue",
        ["USD"],
    )
    if not cash:
        cash = _extract_annual_values(
            facts,
            "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
            ["USD"],
        )

    shares = _extract_annual_values(
        facts,
        "CommonStockSharesOutstanding",
        ["shares"],
    )
    if not shares:
        shares = _extract_annual_values(
            facts,
            "EntityCommonStockSharesOutstanding",
            ["shares"],
            taxonomy="dei",
        )

    debt_current = _extract_annual_values(
        facts,
        "DebtCurrent",
        ["USD"],
    )
    debt_long = _extract_annual_values(
        facts,
        "LongTermDebtNoncurrent",
        ["USD"],
    )
    debt = _combine_values(debt_current, debt_long)
    if not debt:
        debt = _extract_annual_values(
            facts,
            "LongTermDebt",
            ["USD"],
        )

    years = sorted(revenue.keys(), reverse=True)
    if not years:
        logger.warning("No revenue data found for %s", symbol)
        years = sorted(set(cash.keys()) | set(debt.keys()) | set(shares.keys()), reverse=True)

    statements: list[EdgarStatement] = []
    for year in years[:5]:
        revenue_value = revenue.get(year)
        cash_value = cash.get(year)
        debt_value = debt.get(year)
        shares_value = shares.get(year)
        period_end = (
            revenue_value.end
            if revenue_value and revenue_value.end
            else cash_value.end
            if cash_value and cash_value.end
            else debt_value.end
            if debt_value and debt_value.end
            else shares_value.end
            if shares_value and shares_value.end
            else f"{year}-12-31"
        )
        filing_date = (
            revenue_value.filed
            if revenue_value and revenue_value.filed
            else cash_value.filed
            if cash_value and cash_value.filed
            else debt_value.filed
            if debt_value and debt_value.filed
            else shares_value.filed
            if shares_value and shares_value.filed
            else None
        )
        statements.append(
            EdgarStatement(
                period_end=period_end,
                period_type="FY",
                filing_date=filing_date,
                currency="USD",
                revenue=revenue_value.value if revenue_value else None,
                cash=cash_value.value if cash_value else None,
                debt=debt_value.value if debt_value else None,
                shares_outstanding=shares_value.value if shares_value else None,
                source="edgar",
            )
        )
    return statements


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
    facts = _get_json(url)
    statements = _build_statements(facts, normalized)

    return EdgarCompanyFacts(
        symbol=normalized,
        name=entry.get("title"),
        cik=cik,
        currency="USD",
        source="edgar",
        updated_at=int(time.time() * 1000),
        statements=statements,
    )
