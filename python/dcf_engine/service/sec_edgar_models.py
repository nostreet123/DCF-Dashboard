from __future__ import annotations

from pydantic import BaseModel, Field


class EdgarSearchResult(BaseModel):
    symbol: str = Field(..., description="Ticker symbol.")
    name: str = Field(..., description="Company name.")
    cik: str = Field(..., description="10-digit CIK.")
    canonical_id: str = Field(..., description="Stable issuer identifier.")
    listing_id: str = Field(..., description="Exchange-aware listing identifier.")
    exchange: str | None = Field(None, description="Exchange display name.")
    mic: str | None = Field(None, description="Market identifier code.")
    country_code: str | None = Field(None, description="ISO country code.")
    coverage_state: str = Field(
        "valuation_ready",
        description="Whether this listing can be valued directly or is search/detail only.",
    )
    detail_url: str | None = Field(None, description="Official source detail URL.")
    source_system: str = Field("SEC EDGAR", description="Official source system.")


class EdgarStatement(BaseModel):
    period_end: str = Field(..., description="Period end date (YYYY-MM-DD).")
    period_type: str = Field("FY", description="Period type.")
    filing_date: str | None = Field(None, description="Filing date.")
    currency: str | None = Field(None, description="Currency code.")
    revenue: float | None = Field(None, description="Annual revenue.")
    operating_income: float | None = Field(None, description="Operating income.")
    operating_margin: float | None = Field(None, description="Operating margin.")
    cash: float | None = Field(None, description="Cash and equivalents.")
    debt: float | None = Field(None, description="Total debt.")
    shares_outstanding: float | None = Field(None, description="Shares outstanding.")
    source: str = Field("edgar", description="Data source.")


class EdgarCompanyFacts(BaseModel):
    symbol: str = Field(..., description="Ticker symbol.")
    name: str | None = Field(None, description="Company name.")
    cik: str = Field(..., description="10-digit CIK.")
    currency: str | None = Field(None, description="Reporting currency.")
    source: str = Field("edgar", description="Data source.")
    updated_at: int = Field(..., description="Updated timestamp (ms).")
    statements: list[EdgarStatement] = Field(
        default_factory=list,
        description="Annual statements.",
    )
