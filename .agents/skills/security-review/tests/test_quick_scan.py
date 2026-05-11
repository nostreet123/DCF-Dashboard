from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "quick_scan.py"
SECRET = "sk_live_1234567890abcdef"


def test_quick_scan_redacts_secret_text_in_non_secret_rule_outputs(tmp_path: Path) -> None:
    if shutil.which("rg") is None:
        pytest.skip("ripgrep is required by quick_scan.py")

    source = tmp_path / "leaky_ssrf.py"
    source.write_text(
        'import requests\n'
        f'resp = requests.get("https://example.invalid/api", '
        f'headers={{"Authorization": "Bearer {SECRET}"}})\n'
    )

    text_completed = subprocess.run(
        [sys.executable, str(SCRIPT_PATH), str(tmp_path), "--show-lines"],
        capture_output=True,
        check=True,
        text=True,
    )
    assert SECRET not in text_completed.stdout
    assert "Bearer [REDACTED]" in text_completed.stdout

    json_completed = subprocess.run(
        [sys.executable, str(SCRIPT_PATH), str(tmp_path), "--output", "json"],
        capture_output=True,
        check=True,
        text=True,
    )
    assert SECRET not in json_completed.stdout

    payload = json.loads(json_completed.stdout)
    ssrf_matches = next(rule["matches"] for rule in payload["rules"] if rule["key"] == "ssrf")
    assert ssrf_matches == [
        {
            "path": str(source),
            "line": 2,
            "line_text": (
                'resp = requests.get("https://example.invalid/api", '
                'headers={"Authorization": "Bearer [REDACTED]"})'
            ),
        }
    ]
