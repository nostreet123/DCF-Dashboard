from __future__ import annotations

from pathlib import Path

import pandas as pd
import pytest

from damodaran_sync import excel_parse
from damodaran_sync.excel_parse import parse_excel


def _write_excel(path: Path, sheets: dict[str, pd.DataFrame]) -> None:
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        for name, frame in sheets.items():
            frame.to_excel(writer, sheet_name=name, header=False, index=False)


def test_preferred_sheet_selected(tmp_path: Path) -> None:
    file_path = tmp_path / "sample.xlsx"
    data_sheet = pd.DataFrame([["Header", "Metric"], ["Row", 1]])
    other_sheet = pd.DataFrame([["H1", "H2"], ["Row", 1], ["Row", 2], ["Row", 3]])
    _write_excel(file_path, {"Data": data_sheet, "Other": other_sheet})

    parsed = parse_excel(file_path)
    assert parsed.sheet_name == "Data"
    assert parsed.header_row == 0


def test_header_detection_and_normalization(tmp_path: Path) -> None:
    file_path = tmp_path / "normalize.xlsx"
    frame = pd.DataFrame(
        [
            [None, None, None],
            ["Industry", "Margin", "Growth"],
            ["Tech", "5.0%", "1,234"],
        ]
    )
    _write_excel(file_path, {"Sheet1": frame})

    parsed = parse_excel(file_path)
    assert parsed.header_row == 1
    assert parsed.column_names[:3] == ["Industry", "Margin", "Growth"]
    assert parsed.rows[0][1] == 0.05
    assert parsed.rows[0][2] == 1234.0


def test_parse_excel_rejects_empty_selected_sheet(tmp_path: Path) -> None:
    file_path = tmp_path / "empty.xlsx"
    _write_excel(file_path, {"Sheet1": pd.DataFrame()})

    with pytest.raises(ValueError, match="Sheet1.*empty"):
        parse_excel(file_path)


def test_parse_excel_rejects_oversized_workbook(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    file_path = tmp_path / "large.xlsx"
    _write_excel(file_path, {"Sheet1": pd.DataFrame([["Header"], ["Row"]])})
    monkeypatch.setenv("DAMODARAN_EXCEL_MAX_FILE_BYTES", "1")

    with pytest.raises(ValueError, match="maximum size"):
        parse_excel(file_path)


def test_parse_excel_rejects_too_many_sheets(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    file_path = tmp_path / "sheets.xlsx"
    _write_excel(
        file_path,
        {
            "One": pd.DataFrame([["Header"], ["Row"]]),
            "Two": pd.DataFrame([["Header"], ["Row"]]),
        },
    )
    monkeypatch.setenv("DAMODARAN_EXCEL_MAX_SHEETS", "1")

    with pytest.raises(ValueError, match="sheet count"):
        parse_excel(file_path)


def test_parse_excel_rejects_too_many_rows(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    file_path = tmp_path / "rows.xlsx"
    _write_excel(file_path, {"Sheet1": pd.DataFrame([["Header"], ["One"], ["Two"]])})
    monkeypatch.setenv("DAMODARAN_EXCEL_MAX_ROWS", "1")

    with pytest.raises(ValueError, match="row count"):
        parse_excel(file_path)


def test_parse_excel_rejects_too_many_columns(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    file_path = tmp_path / "columns.xlsx"
    _write_excel(file_path, {"Sheet1": pd.DataFrame([["A", "B"], ["One", "Two"]])})
    monkeypatch.setenv("DAMODARAN_EXCEL_MAX_COLUMNS", "1")

    with pytest.raises(ValueError, match="column count"):
        parse_excel(file_path)


def test_bounded_reader_uses_xls_actual_column_count(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    class FakeXlsSheet:
        ncols = 3

    class FakeXlsBook:
        def sheet_by_name(self, sheet_name: str) -> FakeXlsSheet:
            assert sheet_name == "Data"
            return FakeXlsSheet()

    class FakeExcelFile:
        book = FakeXlsBook()

    def fake_read_excel(excel_file: object, **kwargs: object) -> pd.DataFrame:
        assert isinstance(excel_file, FakeExcelFile)
        captured.update(kwargs)
        return pd.DataFrame([["A", "B", "C"], [1, 2, 3]])

    monkeypatch.setattr(excel_parse.pd, "read_excel", fake_read_excel)

    frame = excel_parse._read_excel_bounded(FakeExcelFile(), "Data")  # noqa: SLF001

    assert list(captured["usecols"]) == [0, 1, 2]
    assert frame.shape == (2, 3)
