from __future__ import annotations

from pathlib import Path

import pandas as pd

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
