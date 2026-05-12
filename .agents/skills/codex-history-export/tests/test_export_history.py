from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "export_history.py"

spec = importlib.util.spec_from_file_location("export_history", SCRIPT_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Unable to load {SCRIPT_PATH}")
export_history = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = export_history
spec.loader.exec_module(export_history)


def test_redact_text_covers_common_secret_syntaxes() -> None:
    text = " ".join(
        [
            'OPENAI_API_KEY="sk-proj-abcdefghijklmnopqrstuvwxyz123456"',
            "authorization: Bearer eyJabcdefghijklmnopqrstuvwxyz.eyJpayload.signature",
            '{"apiKey": "plain-secret-value"}',
            '{"password": "correct-horse-battery-staple"}',
            "--api-key cli-secret-value",
            "password: correct horse battery staple",
            '{\\"client_secret\\": \\"escaped-secret-value\\"}',
            "github token ghp_abcdefghijklmnopqrstuvwxyz123456",
            "jwt eyJheader.eyJpayload.signaturepart",
            "pem -----BEGIN PRIVATE KEY----- abc123 -----END PRIVATE KEY-----",
            "?code=oauth-code&access_token=oauth-access",
        ]
    )

    redacted = export_history.redact_text(text)

    for leaked in [
        "sk-proj-abcdefghijklmnopqrstuvwxyz123456",
        "eyJabcdefghijklmnopqrstuvwxyz.eyJpayload.signature",
        "plain-secret-value",
        "correct-horse-battery-staple",
        "cli-secret-value",
        "correct horse battery staple",
        "escaped-secret-value",
        "ghp_abcdefghijklmnopqrstuvwxyz123456",
        "eyJheader.eyJpayload.signaturepart",
        "abc123",
        "oauth-code",
        "oauth-access",
    ]:
        assert leaked not in redacted
    assert "<REDACTED" in redacted


def test_redact_text_covers_standalone_escaped_json_secret() -> None:
    redacted = export_history.redact_text(r'{\"client_secret\": \"escaped-secret-value\"}')

    assert "escaped-secret-value" not in redacted
    assert "<REDACTED" in redacted


def test_default_export_redacts_common_secret_syntaxes(tmp_path: Path) -> None:
    history_path = tmp_path / "history.jsonl"
    output_path = tmp_path / "out.txt"
    entries = [
        {
            "session_id": "s1",
            "ts": 1_700_000_000,
            "text": 'OPENAI_API_KEY="sk-proj-abcdefghijklmnopqrstuvwxyz123456" authorization: Bearer secret-bearer-token {"apiKey": "plain-secret-value"} ghp_abcdefghijklmnopqrstuvwxyz123456',
        }
    ]
    history_path.write_text("\n".join(json.dumps(entry) for entry in entries) + "\n", encoding="utf-8")

    subprocess.run(
        [sys.executable, str(SCRIPT_PATH), "--in", str(history_path), "--out", str(output_path)],
        check=True,
    )

    output = output_path.read_text(encoding="utf-8")
    assert "sk-proj-abcdefghijklmnopqrstuvwxyz123456" not in output
    assert "secret-bearer-token" not in output
    assert "plain-secret-value" not in output
    assert "ghp_abcdefghijklmnopqrstuvwxyz123456" not in output
    assert "<REDACTED" in output
