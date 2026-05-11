from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import requests

from dcf_engine.service.company_contracts import (
    CompanyDetail,
    CompanySearchResult,
    SourceLink,
)
from dcf_engine.service.sec_edgar import fetch_company_facts, search_companies
from dcf_engine.service.sec_edgar_models import EdgarCompanyFacts

SEC_MICS = {"XNAS", "XNYS", "ARCX", "XASE"}


def _sec_fact_gaps(facts: EdgarCompanyFacts) -> list[str]:
    latest = facts.statements[0] if facts.statements else None
    if latest is None:
        return ["annual statements"]

    gaps: list[str] = []
    if latest.revenue is None:
        gaps.append("revenue")
    if latest.shares_outstanding is None:
        gaps.append("shares outstanding")
    return gaps


def _sec_coverage_for_symbol(symbol: str) -> tuple[str, str]:
    try:
        facts = fetch_company_facts(symbol)
    except (RuntimeError, ValueError, requests.RequestException):
        return (
            "import_required",
            "Official SEC listing found, but annual facts could not be prepared. Import reviewed statements to unlock valuation.",
        )

    gaps = _sec_fact_gaps(facts)
    if gaps:
        return (
            "import_required",
            f"Official SEC listing found, but EDGAR companyfacts are missing {', '.join(gaps)}. Import reviewed statements to unlock valuation.",
        )

    return (
        "valuation_ready",
        "Valuation-ready through official SEC company facts.",
    )


class MarketAdapter(Protocol):
    def search(self, query: str, limit: int) -> list[CompanySearchResult]:
        ...

    def detail(self, listing_id: str) -> CompanyDetail | None:
        ...


@dataclass(frozen=True)
class StaticListing:
    id: str
    symbol: str
    name: str
    exchange_mic: str
    market: str
    country: str
    currency: str
    coverage_reason: str
    source_system: str
    source_links: tuple[SourceLink, ...]
    sector: str | None = None
    industry: str | None = None
    website_url: str | None = None
    filings_url: str | None = None
    latest_annual_report_url: str | None = None

    def matches(self, query: str) -> bool:
        normalized = query.casefold().strip()
        if not normalized:
            return False
        haystack = " ".join(
            [
                self.id,
                self.symbol,
                self.name,
                self.exchange_mic,
                self.market,
                self.country,
                self.sector or "",
                self.industry or "",
            ]
        ).casefold()
        return all(token in haystack for token in normalized.split())

    def as_search_result(self) -> CompanySearchResult:
        return CompanySearchResult(
            id=self.id,
            symbol=self.symbol,
            name=self.name,
            exchangeMic=self.exchange_mic,
            market=self.market,
            country=self.country,
            currency=self.currency,
            coverageState="import_required",
            coverageReason=self.coverage_reason,
            sourceLinks=list(self.source_links),
        )

    def as_detail(self) -> CompanyDetail:
        return CompanyDetail(
            **self.as_search_result().model_dump(by_alias=True),
            sourceSystem=self.source_system,
            sector=self.sector,
            industry=self.industry,
            websiteUrl=self.website_url,
            filingsUrl=self.filings_url,
            latestAnnualReportUrl=self.latest_annual_report_url,
        )


class SECAdapter:
    def search(self, query: str, limit: int) -> list[CompanySearchResult]:
        results = search_companies(query, limit=limit)
        search_results: list[CompanySearchResult] = []
        for result in results:
            coverage_state, coverage_reason = _sec_coverage_for_symbol(result.symbol)
            listing_id = result.listing_id or (
                f"{result.mic}:{result.symbol}" if result.mic else result.symbol
            )
            exchange_mic = result.mic or "XNAS"
            search_results.append(
                CompanySearchResult(
                    id=listing_id,
                    symbol=result.symbol,
                    name=result.name,
                    exchangeMic=exchange_mic,
                    market=result.exchange or "United States",
                    country=result.country_code or "US",
                    currency="USD",
                    coverageState=coverage_state,
                    coverageReason=coverage_reason,
                    sourceLinks=[
                        *(
                            [SourceLink(title="SEC EDGAR Browse", url=result.detail_url)]
                            if result.detail_url
                            else []
                        ),
                        SourceLink(
                            title="SEC Company Facts",
                            url=f"https://data.sec.gov/api/xbrl/companyfacts/CIK{result.cik}.json",
                        ),
                        SourceLink(
                            title="SEC Submissions",
                            url=f"https://data.sec.gov/submissions/CIK{result.cik}.json",
                        ),
                    ],
                )
            )
        return search_results

    def detail(self, listing_id: str) -> CompanyDetail | None:
        normalized = listing_id.strip().upper()
        requested_mic = "XNAS"
        if ":" in normalized:
            mic, symbol = normalized.split(":", 1)
            if mic not in SEC_MICS:
                return None
            requested_mic = mic
        else:
            symbol = normalized
        try:
            facts = fetch_company_facts(symbol)
        except ValueError:
            return None
        except (RuntimeError, requests.RequestException):
            raise
        gaps = _sec_fact_gaps(facts)
        coverage_state = "import_required" if gaps else "valuation_ready"
        coverage_reason = (
            f"Official SEC listing found, but EDGAR companyfacts are missing {', '.join(gaps)}. Import reviewed statements to unlock valuation."
            if gaps
            else "Valuation-ready through official SEC company facts."
        )
        return CompanyDetail(
            id=f"{requested_mic}:{facts.symbol}",
            symbol=facts.symbol,
            name=facts.name or facts.symbol,
            exchangeMic=requested_mic,
            market="United States",
            country="US",
            currency=facts.currency or "USD",
            coverageState=coverage_state,
            coverageReason=coverage_reason,
            sourceSystem="SEC EDGAR companyfacts",
            sourceLinks=[
                SourceLink(
                    title="SEC Company Facts",
                    url=f"https://data.sec.gov/api/xbrl/companyfacts/CIK{facts.cik}.json",
                )
            ],
        )


class StaticAdapter:
    def __init__(self, listings: list[StaticListing]) -> None:
        self._listings = listings

    def search(self, query: str, limit: int) -> list[CompanySearchResult]:
        return [
            listing.as_search_result()
            for listing in self._listings
            if listing.matches(query)
        ][:limit]

    def detail(self, listing_id: str) -> CompanyDetail | None:
        normalized = listing_id.strip().upper()
        for listing in self._listings:
            if listing.id.upper() == normalized or listing.symbol.upper() == normalized:
                return listing.as_detail()
        return None


BVB_LISTINGS = [
    StaticListing(
        id="XBSE:TLV",
        symbol="TLV",
        name="Banca Transilvania S.A.",
        exchange_mic="XBSE",
        market="Bucharest Stock Exchange",
        country="RO",
        currency="RON",
        sector="Financials",
        industry="Banks",
        coverage_reason=(
            "Official BVB listing detail is available. Import reviewed annual "
            "statements to unlock valuation."
        ),
        source_system="BVB listing detail and official filing links",
        source_links=(
            SourceLink(title="BVB Instrument Detail", url="https://www.bvb.ro/FinancialInstruments/Details/FinancialInstrumentsDetails.aspx?s=TLV"),
            SourceLink(title="Issuer Website", url="https://www.bancatransilvania.ro/"),
        ),
    ),
    StaticListing(
        id="XBSE:BRD",
        symbol="BRD",
        name="BRD Group Societe Generale S.A.",
        exchange_mic="XBSE",
        market="Bucharest Stock Exchange",
        country="RO",
        currency="RON",
        sector="Financials",
        industry="Banks",
        coverage_reason=(
            "Official BVB listing detail is available. Import reviewed annual "
            "statements to unlock valuation."
        ),
        source_system="BVB listing detail and official filing links",
        source_links=(
            SourceLink(title="BVB Instrument Detail", url="https://www.bvb.ro/FinancialInstruments/Details/FinancialInstrumentsDetails.aspx?s=BRD"),
            SourceLink(title="Issuer Website", url="https://www.brd.ro/"),
        ),
    ),
]

JPX_LISTINGS = [
    StaticListing(
        id="XTKS:7203",
        symbol="7203",
        name="Toyota Motor Corporation",
        exchange_mic="XTKS",
        market="Japan Exchange Group",
        country="JP",
        currency="JPY",
        sector="Consumer Cyclical",
        industry="Auto Manufacturers",
        coverage_reason=(
            "Official JPX listing is searchable. Import reviewed annual "
            "statements to unlock valuation."
        ),
        source_system="JPX Listed Company Search",
        source_links=(
            SourceLink(title="JPX Listed Company Search", url="https://www.jpx.co.jp/english/listing/stocks/new/index.html"),
            SourceLink(title="Issuer Website", url="https://global.toyota/en/ir/"),
        ),
    )
]

TSX_LISTINGS = [
    StaticListing(
        id="XTSE:SHOP",
        symbol="SHOP",
        name="Shopify Inc.",
        exchange_mic="XTSE",
        market="Toronto Stock Exchange",
        country="CA",
        currency="CAD",
        sector="Technology",
        industry="Software",
        coverage_reason=(
            "Official TMX listing detail is available. Import reviewed annual "
            "statements to unlock valuation."
        ),
        source_system="TMX Company Directory",
        source_links=(
            SourceLink(title="TMX Money Quote", url="https://money.tmx.com/en/quote/SHOP"),
            SourceLink(title="Issuer Website", url="https://www.shopify.com/investors"),
        ),
    )
]


ADAPTERS: list[MarketAdapter] = [
    SECAdapter(),
    StaticAdapter(BVB_LISTINGS),
    StaticAdapter(JPX_LISTINGS),
    StaticAdapter(TSX_LISTINGS),
]


def search_official_companies(query: str, limit: int) -> list[CompanySearchResult]:
    trimmed = query.strip()
    if not trimmed:
        return []
    merged: list[CompanySearchResult] = []
    seen: set[str] = set()
    for adapter in ADAPTERS:
        try:
            adapter_results = adapter.search(trimmed, limit=limit)
        except (RuntimeError, requests.RequestException):
            continue
        for result in adapter_results:
            if result.id in seen:
                continue
            seen.add(result.id)
            merged.append(result)

    def score(result: CompanySearchResult) -> tuple[int, str]:
        symbol = result.symbol.upper()
        query = trimmed.upper()
        symbol_match = symbol == query
        root_match = symbol.split("-", 1)[0].split(".", 1)[0] == query
        prefix_match = symbol.startswith(query)
        ready_bonus = result.coverage_state == "valuation_ready"
        return (
            (600 if symbol_match else 0)
            + (450 if root_match else 0)
            + (300 if prefix_match else 0)
            + (100 if ready_bonus else 0),
            result.symbol,
        )

    return sorted(merged, key=lambda result: (-score(result)[0], score(result)[1]))[:limit]


def fetch_official_detail(listing_id: str) -> CompanyDetail:
    for adapter in ADAPTERS:
        detail = adapter.detail(listing_id)
        if detail is not None:
            return detail
    raise ValueError(f"Unknown listing: {listing_id}")
