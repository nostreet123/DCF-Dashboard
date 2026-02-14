from __future__ import annotations

from pydantic import BaseModel, Field


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
