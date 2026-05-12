from __future__ import annotations

import base64
import io
import zipfile

import pytest
from openpyxl import Workbook

from dcf_engine.service.company_contracts import ImportParseRequest, ParseArtifactRequest
from dcf_engine.service import statement_import
from dcf_engine.service.statement_import import parse_import_payload, read_pdf_text, read_tabular_rows


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


def test_xlsx_import_parse_builds_reviewable_statement_fields() -> None:
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "Income"
    worksheet.append(["Metric", "2024"])
    worksheet.append(["Period end", "2024-12-31"])
    worksheet.append(["Reporting currency", "USD"])
    worksheet.append(["Revenue", "125000000"])
    worksheet.append(["Cash and cash equivalents", "18000000"])
    worksheet.append(["Total debt", "9000000"])
    worksheet.append(["Shares outstanding", "25000000"])
    content = io.BytesIO()
    workbook.save(content)

    payload = ImportParseRequest(
        artifacts=[
            ParseArtifactRequest(
                id="artifact-xlsx",
                originalFilename="income.xlsx",
                contentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                contentBase64=base64.b64encode(content.getvalue()).decode(),
            )
        ]
    )

    result = parse_import_payload(payload)

    assert result.artifacts[0].parser_name == "Excel"
    assert result.review.is_valuation_ready is True
    fields = {field.field: field.value for field in result.review.fields}
    assert fields["revenue"] == "125000000"


def test_xlsx_import_rejects_excess_uncompressed_archive(monkeypatch: pytest.MonkeyPatch) -> None:
    content = io.BytesIO()
    with zipfile.ZipFile(content, "w", compression=zipfile.ZIP_DEFLATED) as workbook_zip:
        workbook_zip.writestr("xl/worksheets/sheet1.xml", "x" * 128)
    monkeypatch.setattr("dcf_engine.service.statement_import.MAX_SPREADSHEET_UNCOMPRESSED_BYTES", 32)

    with pytest.raises(ValueError, match="expands beyond"):
        read_tabular_rows(content.getvalue(), "bomb.xlsx")


def test_xlsx_import_rejects_malformed_workbook_zip() -> None:
    content = io.BytesIO()
    with zipfile.ZipFile(content, "w", compression=zipfile.ZIP_DEFLATED) as workbook_zip:
        workbook_zip.writestr("not-workbook.txt", "not an XLSX workbook")

    with pytest.raises(ValueError, match="Invalid XLSX"):
        read_tabular_rows(content.getvalue(), "bad.xlsx")


def test_xls_import_rejects_malformed_workbook() -> None:
    with pytest.raises(ValueError, match="Invalid XLS"):
        read_tabular_rows(b"not a biff workbook", "bad.xls")


def test_xls_import_rejects_malformed_ole_workbook(monkeypatch: pytest.MonkeyPatch) -> None:
    def raise_compdoc_error(*_args: object, **_kwargs: object) -> None:
        raise statement_import.CompDocError("corrupt OLE container")

    monkeypatch.setattr(statement_import.xlrd, "open_workbook", raise_compdoc_error)

    with pytest.raises(ValueError, match="Invalid XLS"):
        read_tabular_rows(b"not a valid ole workbook", "bad.xls")


def test_csv_import_rejects_excess_rows(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("dcf_engine.service.statement_import.MAX_TABULAR_ROWS", 2)

    with pytest.raises(ValueError, match="too many rows"):
        read_tabular_rows(b"a\nb\nc\n", "large.csv")


def test_pdf_import_rejects_excess_pages(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakePdfReader:
        def __init__(self, _stream: io.BytesIO) -> None:
            self.pages = [object(), object()]

    monkeypatch.setattr(statement_import, "_load_pdf_reader", lambda: FakePdfReader)
    monkeypatch.setattr("dcf_engine.service.statement_import.MAX_PDF_PAGES", 1)

    with pytest.raises(ValueError, match="too many pages"):
        read_pdf_text(b"%PDF")


def test_pdf_import_rejects_excess_extracted_text(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakePage:
        def extract_text(self) -> str:
            return "x" * 64

    class FakePdfReader:
        def __init__(self, _stream: io.BytesIO) -> None:
            self.pages = [FakePage(), FakePage()]

    monkeypatch.setattr(statement_import, "_load_pdf_reader", lambda: FakePdfReader)
    monkeypatch.setattr("dcf_engine.service.statement_import.MAX_PDF_TEXT_CHARS", 100)

    with pytest.raises(ValueError, match="too much text"):
        read_pdf_text(b"%PDF")


def test_pdf_import_rejects_excess_text_during_page_extraction(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakePage:
        def extract_text(self, *, visitor_text) -> None:
            visitor_text("x" * 64, None, None, None, None)
            visitor_text("x" * 64, None, None, None, None)

    class FakePdfReader:
        def __init__(self, _stream: io.BytesIO) -> None:
            self.pages = [FakePage()]

    monkeypatch.setattr(statement_import, "_load_pdf_reader", lambda: FakePdfReader)
    monkeypatch.setattr("dcf_engine.service.statement_import.MAX_PDF_PAGE_TEXT_CHARS", 100)

    with pytest.raises(ValueError, match="too much text"):
        read_pdf_text(b"%PDF")
