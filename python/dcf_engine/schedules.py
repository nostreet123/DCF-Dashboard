from __future__ import annotations

from dcf_engine.schema import ForecastSchedule


def build_schedule(base_year: int, periods: int) -> ForecastSchedule:
    t = list(range(1, periods + 1))
    years = [base_year + i for i in t]
    return ForecastSchedule(t=t, years=years)
