from __future__ import annotations

from datetime import date

from damodaran_sync.date_parser import infer_date_from_filename, parse_link_label_as_of_date


def test_parse_month_year_slash():
    parsed = parse_link_label_as_of_date("1/24")
    assert parsed is not None
    assert parsed.value == date(2024, 1, 1)
    assert parsed.granularity == "month"


def test_parse_month_name_year():
    parsed = parse_link_label_as_of_date("July 2025")
    assert parsed is not None
    assert parsed.value == date(2025, 7, 1)
    assert parsed.granularity == "month"


def test_parse_full_date_with_suffix():
    parsed = parse_link_label_as_of_date("January 9, 2025 update")
    assert parsed is not None
    assert parsed.value == date(2025, 1, 9)
    assert parsed.granularity == "day"


def test_parse_invalid_returns_none():
    assert parse_link_label_as_of_date("Download") is None


def test_infer_date_from_filename_month_name():
    parsed = infer_date_from_filename("ctrypremJuly25.xlsx")
    assert parsed is not None
    assert parsed.value == date(2025, 7, 1)
    assert parsed.granularity == "month"


def test_infer_date_from_filename_year_month():
    parsed = infer_date_from_filename("report_2024-01.xls")
    assert parsed is not None
    assert parsed.value == date(2024, 1, 1)
    assert parsed.granularity == "month"
