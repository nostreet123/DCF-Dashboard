from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

SKILL_SCRIPT_DIR = (
    Path(__file__).resolve().parents[2] / ".agents" / "skills" / "llm-council" / "scripts"
)
sys.path.insert(0, str(SKILL_SCRIPT_DIR))

from ui_server import start_server  # noqa: E402
from ui_state import UIState  # noqa: E402


def _read_json(url: str, *, token: str | None = None) -> dict[str, Any]:
    headers = {"X-UI-Token": token} if token else {}
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=2) as response:
        return json.loads(response.read().decode("utf-8"))


def _assert_forbidden(url: str) -> None:
    try:
        _read_json(url)
    except urllib.error.HTTPError as exc:
        assert exc.code == 403
    else:
        raise AssertionError(f"Expected forbidden response for {url}")


def test_state_endpoints_require_ui_token(tmp_path: Path) -> None:
    state = UIState()
    state.update(
        {"task_brief": "CONFIDENTIAL task", "final_plan": "SECRET final plan"}
    )
    (tmp_path / "index.html").write_text("", encoding="utf-8")

    server = start_server(ui_dir=tmp_path, state=state)
    base_url = f"http://127.0.0.1:{server.server_address[1]}"
    try:
        _assert_forbidden(f"{base_url}/api/state")
        _assert_forbidden(f"{base_url}/ui/state?token=wrong-token")

        api_payload = _read_json(f"{base_url}/api/state?token={server.token}")
        ui_payload = _read_json(f"{base_url}/ui/state", token=server.token)

        assert api_payload["task_brief"] == "CONFIDENTIAL task"
        assert ui_payload["final_plan"] == "SECRET final plan"
    finally:
        server.shutdown()
        server.server_close()
