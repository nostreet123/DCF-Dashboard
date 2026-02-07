from __future__ import annotations

from dcf_engine.service.sec_edgar import _build_statements, _extract_annual_values


def test_extract_annual_values_defaults_to_us_gaap() -> None:
    facts = {
        "facts": {
            "us-gaap": {
                "Revenues": {
                    "units": {
                        "USD": [
                            {
                                "fy": 2024,
                                "fp": "FY",
                                "val": 100.0,
                                "end": "2024-12-31",
                                "filed": "2025-02-01",
                            },
                            {
                                "fy": 2024,
                                "fp": "FY",
                                "val": 110.0,
                                "end": "2024-12-31",
                                "filed": "2025-02-10",
                            },
                        ]
                    }
                }
            }
        }
    }

    values = _extract_annual_values(facts, "Revenues", ["USD"])

    assert values[2024].value == 110.0
    assert values[2024].filed == "2025-02-10"


def test_extract_annual_values_supports_dei_taxonomy() -> None:
    facts = {
        "facts": {
            "dei": {
                "EntityCommonStockSharesOutstanding": {
                    "units": {
                        "shares": [
                            {
                                "fy": 2024,
                                "fp": "FY",
                                "val": 1234.0,
                                "end": "2024-12-31",
                                "filed": "2025-02-15",
                            }
                        ]
                    }
                }
            }
        }
    }

    values = _extract_annual_values(
        facts,
        "EntityCommonStockSharesOutstanding",
        ["shares"],
        taxonomy="dei",
    )

    assert values[2024].value == 1234.0


def test_build_statements_uses_dei_shares_fallback() -> None:
    facts = {
        "facts": {
            "us-gaap": {
                "Revenues": {
                    "units": {
                        "USD": [
                            {
                                "fy": 2024,
                                "fp": "FY",
                                "val": 2000.0,
                                "end": "2024-12-31",
                                "filed": "2025-02-10",
                            }
                        ]
                    }
                }
            },
            "dei": {
                "EntityCommonStockSharesOutstanding": {
                    "units": {
                        "shares": [
                            {
                                "fy": 2024,
                                "fp": "FY",
                                "val": 555.0,
                                "end": "2024-12-31",
                                "filed": "2025-02-10",
                            }
                        ]
                    }
                }
            },
        }
    }

    statements = _build_statements(facts, "TEST")

    assert len(statements) == 1
    assert statements[0].period_end == "2024-12-31"
    assert statements[0].revenue == 2000.0
    assert statements[0].shares_outstanding == 555.0
