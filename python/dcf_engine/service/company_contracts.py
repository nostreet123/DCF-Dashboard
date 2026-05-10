from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ServiceBaseModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


CoverageState = Literal["valuation_ready", "import_required", "detail_only"]
ImportedArtifactKind = Literal[
    "incomeStatement",
    "balanceSheet",
    "cashFlow",
    "sharesMeta",
]
ParsedFieldName = Literal[
    "periodEnd",
    "filingDate",
    "filingCurrency",
    "revenue",
    "cash",
    "debt",
    "sharesOutstanding",
]
ImportConfidence = Literal["high", "medium", "low"]


class SourceLink(ServiceBaseModel):
    title: str
    url: str


class CompanySearchResult(ServiceBaseModel):
    id: str
    symbol: str
    name: str
    exchange_mic: str | None = Field(None, alias="exchangeMic")
    market: str | None = None
    country: str | None = None
    currency: str | None = None
    coverage_state: CoverageState = Field(..., alias="coverageState")
    coverage_reason: str | None = Field(None, alias="coverageReason")
    logo_url: str | None = Field(None, alias="logoUrl")
    source_links: list[SourceLink] = Field(default_factory=list, alias="sourceLinks")


class CompanyDetail(CompanySearchResult):
    source_system: str | None = Field(None, alias="sourceSystem")
    sector: str | None = None
    industry: str | None = None
    website_url: str | None = Field(None, alias="websiteUrl")
    filings_url: str | None = Field(None, alias="filingsUrl")
    latest_annual_report_url: str | None = Field(None, alias="latestAnnualReportUrl")


class OfficialSearchResponse(ServiceBaseModel):
    results: list[CompanySearchResult]


class ParseArtifactRequest(ServiceBaseModel):
    id: str | None = None
    original_filename: str = Field(..., alias="originalFilename")
    content_type: str | None = Field(None, alias="contentType")
    content_base64: str = Field(..., alias="contentBase64")
    preferred_kind: ImportedArtifactKind | None = Field(None, alias="preferredKind")


class ImportParseRequest(ServiceBaseModel):
    artifacts: list[ParseArtifactRequest]


class ParsedFieldCandidate(ServiceBaseModel):
    field: ParsedFieldName
    raw_value: str = Field(..., alias="rawValue")
    numeric_value: float | None = Field(None, alias="numericValue")
    period_end: str | None = Field(None, alias="periodEnd")
    artifact_id: str = Field(..., alias="artifactId")
    artifact_filename: str = Field(..., alias="artifactFilename")
    confidence: ImportConfidence
    review_required: bool = Field(False, alias="reviewRequired")


class ImportedArtifactMetadata(ServiceBaseModel):
    id: str
    kind: ImportedArtifactKind
    original_filename: str = Field(..., alias="originalFilename")
    parser_name: str = Field(..., alias="parserName")
    file_format: str = Field(..., alias="fileFormat")
    requires_review: bool = Field(..., alias="requiresReview")
    candidates: list[ParsedFieldCandidate]
    notes: list[str] = Field(default_factory=list)


class ImportReviewField(ServiceBaseModel):
    field: ParsedFieldName
    value: str
    source_filename: str | None = Field(None, alias="sourceFilename")
    confidence: ImportConfidence | None = None
    is_manual_override: bool = Field(False, alias="isManualOverride")
    confirmed: bool = False


class ImportReview(ServiceBaseModel):
    chosen_period_end: str | None = Field(None, alias="chosenPeriodEnd")
    fields: list[ImportReviewField]
    missing_required_fields: list[ParsedFieldName] = Field(
        default_factory=list,
        alias="missingRequiredFields",
    )
    notes: list[str] = Field(default_factory=list)
    is_valuation_ready: bool = Field(False, alias="isValuationReady")


class ImportParseResponse(ServiceBaseModel):
    artifacts: list[ImportedArtifactMetadata]
    candidates: list[ParsedFieldCandidate]
    review: ImportReview
