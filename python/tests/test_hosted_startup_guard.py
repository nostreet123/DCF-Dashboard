from __future__ import annotations

import pytest

from dcf_engine.service.internal_auth import assert_safe_hosted_startup


def test_assert_safe_hosted_startup_allows_local_unsigned_mode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("RENDER", raising=False)
    monkeypatch.setenv("DCF_ENGINE_ALLOW_UNSIGNED", "1")
    monkeypatch.delenv("DCF_ENGINE_INTERNAL_KEY", raising=False)

    assert_safe_hosted_startup()


def test_assert_safe_hosted_startup_refuses_unsigned_on_render(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("RENDER", "true")
    monkeypatch.setenv("DCF_ENGINE_ALLOW_UNSIGNED", "1")
    monkeypatch.delenv("DCF_ENGINE_INTERNAL_KEY", raising=False)

    with pytest.raises(RuntimeError, match="Unsafe DCF engine configuration"):
        assert_safe_hosted_startup()


def test_assert_safe_hosted_startup_refuses_process_local_nonces_on_render(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("RENDER", "true")
    monkeypatch.setenv("DCF_ENGINE_ALLOW_PROCESS_LOCAL_NONCES", "1")

    with pytest.raises(RuntimeError, match="DCF_ENGINE_ALLOW_PROCESS_LOCAL_NONCES"):
        assert_safe_hosted_startup()
