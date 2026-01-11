from __future__ import annotations

from dcf_engine.schema import DiscountingTable, NormalizedAssumptions


def discount_fcff(inputs: NormalizedAssumptions, fcff: list[float]) -> DiscountingTable:
    periods = inputs.periods
    if len(fcff) != periods:
        raise ValueError("fcff length must match periods")
    if inputs.wacc_stable <= inputs.g_stable:
        raise ValueError("wacc_stable must be greater than g_stable")

    t = list(range(1, periods + 1))
    years = [inputs.base_year + i for i in t]

    discount_factor: list[float] = []
    pv_fcff: list[float] = []

    for idx in range(periods):
        wacc_t = inputs.wacc[idx]
        df = 1.0 / ((1.0 + wacc_t) ** (idx + 1))
        discount_factor.append(df)
        pv_fcff.append(fcff[idx] * df)

    terminal_fcff = fcff[-1] * (1.0 + inputs.g_stable)
    terminal_value = terminal_fcff / (inputs.wacc_stable - inputs.g_stable)
    pv_terminal = terminal_value * discount_factor[-1]

    return DiscountingTable(
        t=t,
        years=years,
        wacc=inputs.wacc,
        discount_factor=discount_factor,
        pv_fcff=pv_fcff,
        terminal_value=terminal_value,
        pv_terminal=pv_terminal,
    )
