from __future__ import annotations

import csv
from pathlib import Path

import pytest

from dcf_engine.io.export import export_forecast_csv
from dcf_engine.schema import ForecastTable


def test_export_forecast_csv(tmp_path: Path) -> None:
    forecast = ForecastTable(
        t=[0, 1],
        years=[2024, 2025],
        revenue=[100.0, 110.0],
        revenue_growth=[0.1, 0.08],
        ebit_margin=[0.2, 0.21],
        ebit=[20.0, 23.1],
        tax_rate=[0.25, 0.25],
        nopat=[15.0, 17.325],
        sales_to_capital=[1.5, 1.6],
        reinvestment=[5.0, 6.0],
        fcff=[10.0, 11.3],
    )
    out_path = tmp_path / "forecast.csv"

    export_forecast_csv(forecast, out_path)

    with out_path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.reader(handle))

    assert rows == [
        [
            "t",
            "year",
            "revenue",
            "revenue_growth",
            "ebit_margin",
            "ebit",
            "tax_rate",
            "nopat",
            "sales_to_capital",
            "reinvestment",
            "fcff",
        ],
        [
            "0",
            "2024",
            "100.0",
            "0.1",
            "0.2",
            "20.0",
            "0.25",
            "15.0",
            "1.5",
            "5.0",
            "10.0",
        ],
        [
            "1",
            "2025",
            "110.0",
            "0.08",
            "0.21",
            "23.1",
            "0.25",
            "17.325",
            "1.6",
            "6.0",
            "11.3",
        ],
    ]


def test_export_forecast_csv_length_mismatch_raises(tmp_path: Path) -> None:
    forecast = ForecastTable(
        t=[0, 1, 2],
        years=[2024, 2025, 2026],
        revenue=[100.0, 110.0],
        revenue_growth=[0.1, 0.08, 0.05],
        ebit_margin=[0.2, 0.21, 0.22],
        ebit=[20.0, 23.1, 25.0],
        tax_rate=[0.25, 0.25, 0.25],
        nopat=[15.0, 17.325, 18.75],
        sales_to_capital=[1.5, 1.6, 1.7],
        reinvestment=[5.0, 6.0, 7.0],
        fcff=[10.0, 11.3, 12.0],
    )
    out_path = tmp_path / "forecast.csv"

    with pytest.raises(ValueError, match=r"Forecast table lengths mismatch.*t=3"):
        export_forecast_csv(forecast, out_path)
