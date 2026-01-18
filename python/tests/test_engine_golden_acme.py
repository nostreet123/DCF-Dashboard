from __future__ import annotations

import json
from pathlib import Path

import pytest

from dcf_engine.engine import DCFEngine
from dcf_engine.io.config_loader import load_config


FIXTURE_DIR = Path(__file__).parent / "fixtures"
FIXTURES = [
    "acme",
    "acme_high_growth",
    "acme_distressed",
]


def _assert_close(actual, expected, path: str = "root") -> None:
    if isinstance(expected, dict):
        assert isinstance(actual, dict), f"{path}: expected dict"
        assert actual.keys() == expected.keys(), f"{path}: keys mismatch"
        for key in expected:
            _assert_close(actual[key], expected[key], f"{path}.{key}")
        return
    if isinstance(expected, list):
        assert isinstance(actual, list), f"{path}: expected list"
        assert len(actual) == len(expected), f"{path}: length mismatch"
        for idx, (a_item, e_item) in enumerate(zip(actual, expected)):
            _assert_close(a_item, e_item, f"{path}[{idx}]")
        return
    if isinstance(expected, float):
        assert actual == pytest.approx(expected, rel=1e-6, abs=1e-6), f"{path}: float mismatch"
        return
    assert actual == expected, f"{path}: value mismatch"


@pytest.mark.parametrize("fixture_name", FIXTURES)
def test_engine_golden_acme(fixture_name: str):
    inputs, _ = load_config(str(FIXTURE_DIR / f"{fixture_name}_inputs.yaml"))
    engine = DCFEngine()
    result, trace = engine.run(inputs)
    actual = {
        "result": result.model_dump(),
        "trace": trace.model_dump(),
    }
    expected = json.loads(
        (FIXTURE_DIR / f"{fixture_name}_expected_outputs.json").read_text()
    )
    _assert_close(actual, expected)
