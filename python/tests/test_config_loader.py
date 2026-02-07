from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from dcf_engine.io.config_loader import load_config


def test_load_config_with_reference(tmp_path: Path) -> None:
    payload = {
        "base_year": 2024,
        "periods": 2,
        "revenue_t0": 100.0,
        "revenue_growth": [0.1, 0.1],
        "ebit_margin": [0.2, 0.2],
        "tax_rate": [0.25, 0.25],
        "sales_to_capital": [2.0, 2.0],
        "reinvestment_lag_years": 0,
        "wacc": [0.1, 0.1],
        "g_stable": 0.02,
        "wacc_stable": 0.08,
        "cash": 0.0,
        "debt": 0.0,
        "other_non_operating_assets": 0.0,
        "shares_outstanding": 10.0,
        "reference": {
            "primary_key_norm": "software",
            "region_code": "us",
            "as_of_date": "2026-01-09",
            "policy": "latest",
        },
    }
    path = tmp_path / "config.yaml"
    path.write_text(yaml.safe_dump(payload), encoding="utf-8")

    inputs, selector = load_config(str(path))

    assert selector is not None
    assert selector.primary_key_norm == "software"
    assert selector.region_code == "us"
    assert selector.as_of_date == "2026-01-09"
    assert selector.policy == "latest"
    assert inputs.periods == 2


def test_load_config_rejects_non_mapping_reference(tmp_path: Path) -> None:
    payload = {
        "base_year": 2024,
        "periods": 2,
        "revenue_t0": 100.0,
        "revenue_growth": [0.1, 0.1],
        "ebit_margin": [0.2, 0.2],
        "tax_rate": [0.25, 0.25],
        "sales_to_capital": [2.0, 2.0],
        "reinvestment_lag_years": 0,
        "wacc": [0.1, 0.1],
        "g_stable": 0.02,
        "wacc_stable": 0.08,
        "cash": 0.0,
        "debt": 0.0,
        "other_non_operating_assets": 0.0,
        "shares_outstanding": 10.0,
        "reference": "software-us-latest",
    }
    path = tmp_path / "config.yaml"
    path.write_text(yaml.safe_dump(payload), encoding="utf-8")

    with pytest.raises(ValueError, match="reference must be a mapping"):
        load_config(str(path))
