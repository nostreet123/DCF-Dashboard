from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
import math
import numbers
import re
from typing import Iterable

import pandas as pd

PREFERRED_SHEET_NAMES = ["industry averages", "data", "sheet1", "sheet 1"]


@dataclass(frozen=True)
class ParsedTable:
    sheet_name: str
    header_row: int
    column_names: list[str]
    rows: list[list[object]]
    row_count: int
    sheet_candidates: list[str]
    skipped_sheets: list[str]


def _normalize_sheet_name(name: str) -> str:
    return " ".join(name.strip().lower().split())


def _is_empty(value: object) -> bool:
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    return False


def _count_non_empty(values: Iterable[object]) -> int:
    return sum(0 if _is_empty(value) else 1 for value in values)


def _is_dimension_label(value: object) -> bool:
    if _is_empty(value):
        return False
    if isinstance(value, str):
        return True
    if isinstance(value, numbers.Number) and not isinstance(value, bool):
        return True
    return False


def _select_sheet(excel_file: pd.ExcelFile) -> str:
    sheet_names = list(excel_file.sheet_names)
    normalized: dict[str, list[str]] = defaultdict(list)
    for name in sheet_names:
        normalized[_normalize_sheet_name(name)].append(name)
    for preferred in PREFERRED_SHEET_NAMES:
        if preferred in normalized:
            return normalized[preferred][0]

    best_name = sheet_names[0]
    best_count = -1
    for sheet_name in sheet_names:
        frame = pd.read_excel(excel_file, sheet_name=sheet_name, header=None, dtype=object)
        count = int(frame.apply(_count_non_empty, axis=1).gt(0).sum())
        if count > best_count:
            best_count = count
            best_name = sheet_name
    return best_name


def _find_header_row(frame: pd.DataFrame, max_scan: int = 50) -> int:
    limit = min(max_scan, len(frame))
    best_index = 0
    best_count = -1

    rows = frame.head(limit).values.tolist()
    for idx, row in enumerate(rows):
        non_empty = _count_non_empty(row)
        if non_empty > best_count and _is_dimension_label(row[0]):
            best_count = non_empty
            best_index = idx
        if non_empty >= 3 and _is_dimension_label(row[0]):
            return idx

    return best_index


def _make_unique(names: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    unique: list[str] = []
    for name in names:
        count = seen.get(name, 0) + 1
        seen[name] = count
        if count == 1:
            unique.append(name)
        else:
            unique.append(f"{name}_{count}")
    return unique


def _normalize_cell(value: object) -> object:
    if _is_empty(value):
        return None

    if isinstance(value, (int, float)):
        if isinstance(value, float) and math.isnan(value):
            return None
        return float(value)

    if isinstance(value, str):
        stripped = value.strip()
        if stripped == "":
            return None

        percent_match = re.match(r"^-?\d+(?:\.\d+)?%$", stripped)
        if percent_match:
            return float(stripped[:-1]) / 100.0

        numeric_match = re.match(r"^-?\d{1,3}(?:,\d{3})*(?:\.\d+)?$", stripped)
        if numeric_match:
            return float(stripped.replace(",", ""))

        plain_numeric = re.match(r"^-?\d+(?:\.\d+)?$", stripped)
        if plain_numeric:
            return float(stripped)

        return stripped

    return str(value).strip()


def parse_excel(path: str | Path) -> ParsedTable:
    file_path = Path(path)
    if not file_path.exists():
        raise FileNotFoundError(f"Excel file not found: {file_path}")
    try:
        excel_file = pd.ExcelFile(file_path)
    except Exception as exc:
        raise ValueError(f"Failed to open Excel file {file_path}: {exc}") from exc
    sheet_candidates = list(excel_file.sheet_names)

    try:
        sheet_name = _select_sheet(excel_file)
        frame = pd.read_excel(excel_file, sheet_name=sheet_name, header=None, dtype=object)
    except Exception as exc:
        raise ValueError(f"Failed to parse Excel file {file_path}: {exc}") from exc

    header_row = _find_header_row(frame)
    header_values = frame.iloc[header_row].tolist()
    column_names: list[str] = []
    for idx, value in enumerate(header_values):
        if _is_empty(value):
            column_names.append(f"column_{idx + 1}")
        else:
            column_names.append(str(value).strip())

    column_names = _make_unique(column_names)

    rows: list[list[object]] = []
    data_rows = frame.iloc[header_row + 1:].values.tolist()
    for row_values in data_rows:
        if len(row_values) < len(column_names):
            row_values = row_values + [None] * (len(column_names) - len(row_values))
        if len(row_values) > len(column_names):
            row_values = row_values[:len(column_names)]
        normalized = [_normalize_cell(value) for value in row_values]
        if all(value is None for value in normalized):
            continue
        rows.append(normalized)

    return ParsedTable(
        sheet_name=sheet_name,
        header_row=header_row,
        column_names=column_names,
        rows=rows,
        row_count=len(rows),
        sheet_candidates=sheet_candidates,
        skipped_sheets=[name for name in sheet_candidates if name != sheet_name],
    )
