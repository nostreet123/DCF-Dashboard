from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

from dcf_engine.schema import ForecastTable


def export_json(payload: dict[str, Any], out_path: Path | None) -> None:
    import json

    output = json.dumps(payload, indent=2, sort_keys=True)
    if out_path:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(output + "\n", encoding="utf-8")
    else:
        print(output)


def export_forecast_csv(forecast: ForecastTable, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(
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
            ]
        )
        expected_len = len(forecast.t)
        fields = {
            "years": forecast.years,
            "revenue": forecast.revenue,
            "revenue_growth": forecast.revenue_growth,
            "ebit_margin": forecast.ebit_margin,
            "ebit": forecast.ebit,
            "tax_rate": forecast.tax_rate,
            "nopat": forecast.nopat,
            "sales_to_capital": forecast.sales_to_capital,
            "reinvestment": forecast.reinvestment,
            "fcff": forecast.fcff,
        }
        mismatched = {
            name: len(values) for name, values in fields.items() if len(values) != expected_len
        }
        if mismatched:
            details = ", ".join(
                ["t=" + str(expected_len)]
                + [f"{name}={length}" for name, length in mismatched.items()]
            )
            raise ValueError(
                "Forecast table lengths mismatch: "
                f"expected {expected_len} for all fields, got {details}"
            )
        rows = zip(
            forecast.t,
            forecast.years,
            forecast.revenue,
            forecast.revenue_growth,
            forecast.ebit_margin,
            forecast.ebit,
            forecast.tax_rate,
            forecast.nopat,
            forecast.sales_to_capital,
            forecast.reinvestment,
            forecast.fcff,
        )
        writer.writerows(rows)
