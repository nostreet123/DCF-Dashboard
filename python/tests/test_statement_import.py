from __future__ import annotations

import base64

from dcf_engine.service.company_contracts import ImportParseRequest, ParseArtifactRequest
from dcf_engine.service.statement_import import parse_import_payload


def test_csv_import_parse_builds_reviewable_statement_fields() -> None:
    csv_content = "\n".join(
        [
            "Metric,2024",
            "Period end,2024-12-31",
            "Reporting currency,USD",
            "Revenue,125000000",
            "Cash and cash equivalents,18000000",
            "Total debt,9000000",
            "Shares outstanding,25000000",
        ]
    )
    payload = ImportParseRequest(
        artifacts=[
            ParseArtifactRequest(
                id="artifact-1",
                originalFilename="income.csv",
                contentType="text/csv",
                contentBase64=base64.b64encode(csv_content.encode()).decode(),
            )
        ]
    )

    result = parse_import_payload(payload)

    assert result.artifacts[0].parser_name == "CSV"
    assert result.review.is_valuation_ready is True
    fields = {field.field: field.value for field in result.review.fields}
    assert fields["periodEnd"] == "2024-12-31"
    assert fields["filingCurrency"] == "USD"
    assert fields["revenue"] == "125000000"
    assert fields["cash"] == "18000000"
    assert fields["debt"] == "9000000"
    assert fields["sharesOutstanding"] == "25000000"


def test_csv_import_aligns_period_with_selected_value_column() -> None:
    csv_content = "\n".join(
        [
            "Metric,2023,2024",
            "Period end,2023-12-31,2024-12-31",
            "Reporting currency,USD,USD",
            "Revenue,100000000,125000000",
            "Cash and cash equivalents,12000000,18000000",
            "Total debt,7000000,9000000",
            "Shares outstanding,24000000,25000000",
        ]
    )
    payload = ImportParseRequest(
        artifacts=[
            ParseArtifactRequest(
                id="artifact-period-align",
                originalFilename="income.csv",
                contentType="text/csv",
                contentBase64=base64.b64encode(csv_content.encode()).decode(),
            )
        ]
    )

    result = parse_import_payload(payload)

    fields = {field.field: field.value for field in result.review.fields}
    assert result.review.chosen_period_end == "2024-12-31"
    assert fields["revenue"] == "125000000"
    assert fields["cash"] == "18000000"
    assert fields["debt"] == "9000000"
    assert fields["sharesOutstanding"] == "25000000"


def test_cash_flow_rows_do_not_satisfy_balance_sheet_cash_or_debt() -> None:
    csv_content = "\n".join(
        [
            "Metric,2024",
            "Period end,2024-12-31",
            "Reporting currency,USD",
            "Revenue,125000000",
            "Net cash from operating activities,18000000",
            "Debt repayment,9000000",
            "Shares outstanding,25000000",
        ]
    )
    payload = ImportParseRequest(
        artifacts=[
            ParseArtifactRequest(
                id="artifact-cash-flow",
                originalFilename="cash-flow.csv",
                contentType="text/csv",
                contentBase64=base64.b64encode(csv_content.encode()).decode(),
            )
        ]
    )

    result = parse_import_payload(payload)

    fields = {field.field: field.value for field in result.review.fields}
    assert "cash" not in fields
    assert "debt" not in fields
    assert "cash" in result.review.missing_required_fields
    assert "debt" in result.review.missing_required_fields


def test_pdf_import_fields_are_review_required(monkeypatch) -> None:
    from dcf_engine.service import statement_import

    monkeypatch.setattr(
        statement_import,
        "read_pdf_text",
        lambda _content: "\n".join(
            [
                "Period end 2024-12-31",
                "Reporting currency USD",
                "Revenue 125000000",
                "Cash and cash equivalents 18000000",
                "Total debt 9000000",
                "Shares outstanding 25000000",
            ]
        ),
    )
    payload = ImportParseRequest(
        artifacts=[
            ParseArtifactRequest(
                id="artifact-2",
                originalFilename="annual-report.pdf",
                contentType="application/pdf",
                contentBase64=base64.b64encode(b"%PDF").decode(),
            )
        ]
    )

    result = parse_import_payload(payload)

    assert result.artifacts[0].requires_review is True
    assert result.review.is_valuation_ready is False
    assert result.review.missing_required_fields == []
    assert all(field.confirmed is False for field in result.review.fields)
