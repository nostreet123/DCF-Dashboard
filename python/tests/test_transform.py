from __future__ import annotations

from damodaran_sync.excel_parse import ParsedTable
from damodaran_sync.transform import normalize_primary_key, transform_table


def test_secondary_key_detection():
    parsed = ParsedTable(
        sheet_name="Sheet1",
        header_row=0,
        column_names=["Industry", "Region", "Value"],
        rows=[
            ["Tech", "US", 1.0],
            ["Tech", "Europe", 2.0],
            ["Retail", "US", 3.0],
        ],
        row_count=3,
        sheet_candidates=["Sheet1"],
        skipped_sheets=[],
    )

    result = transform_table(parsed)
    assert result.rows[0].secondary_key == "US"
    assert "Value" in result.rows[0].metrics


def test_metric_second_column_not_secondary():
    parsed = ParsedTable(
        sheet_name="Sheet1",
        header_row=0,
        column_names=["Industry", "Number of Firms", "Margin"],
        rows=[
            ["Tech", 10, 0.2],
            ["Retail", 5, 0.1],
        ],
        row_count=2,
        sheet_candidates=["Sheet1"],
        skipped_sheets=[],
    )

    result = transform_table(parsed)
    assert result.rows[0].secondary_key is None
    assert "Number of Firms" in result.rows[0].metrics


def test_storage_type_convex_for_small_tables():
    parsed = ParsedTable(
        sheet_name="Sheet1",
        header_row=0,
        column_names=["Industry", "Metric"],
        rows=[["Tech", 1.0], ["Retail", 2.0]],
        row_count=2,
        sheet_candidates=["Sheet1"],
        skipped_sheets=[],
    )

    result = transform_table(parsed)
    assert result.storage_type == "convex"


def test_normalize_primary_key():
    assert normalize_primary_key("  Software - (Entertainment) ") == "software entertainment"
