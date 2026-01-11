from __future__ import annotations

from dcf_engine.schedules import build_schedule


def test_build_schedule():
    schedule = build_schedule(2024, 3)
    assert schedule.t == [1, 2, 3]
    assert schedule.years == [2025, 2026, 2027]
