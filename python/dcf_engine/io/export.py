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
        for idx in range(len(forecast.t)):
            writer.writerow(
                [
                    forecast.t[idx],
                    forecast.years[idx],
                    forecast.revenue[idx],
                    forecast.revenue_growth[idx],
                    forecast.ebit_margin[idx],
                    forecast.ebit[idx],
                    forecast.tax_rate[idx],
                    forecast.nopat[idx],
                    forecast.sales_to_capital[idx],
                    forecast.reinvestment[idx],
                    forecast.fcff[idx],
                ]
            )
