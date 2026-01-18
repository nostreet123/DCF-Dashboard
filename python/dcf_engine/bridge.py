from __future__ import annotations

from dcf_engine.schema import BridgeTable, NormalizedAssumptions


def build_bridge(inputs: NormalizedAssumptions, firm_value: float) -> BridgeTable:
    equity_value = (
        firm_value
        + inputs.cash
        + inputs.other_non_operating_assets
        - inputs.debt
    )

    equity_value_adjusted = None
    if inputs.failure_probability is not None or inputs.distress_recovery_fraction is not None:
        if inputs.failure_probability is None or inputs.distress_recovery_fraction is None:
            raise ValueError("Both failure_probability and distress_recovery_fraction are required")
        if not (0.0 <= inputs.failure_probability <= 1.0):
            raise ValueError("failure_probability must be between 0 and 1")
        if not (0.0 <= inputs.distress_recovery_fraction <= 1.0):
            raise ValueError("distress_recovery_fraction must be between 0 and 1")
        factor = (1.0 - inputs.failure_probability) + (
            inputs.failure_probability * inputs.distress_recovery_fraction
        )
        equity_value_adjusted = equity_value * factor

    value_base = equity_value_adjusted if equity_value_adjusted is not None else equity_value
    value_per_share = value_base / inputs.shares_outstanding

    return BridgeTable(
        firm_value=firm_value,
        cash=inputs.cash,
        other_non_operating_assets=inputs.other_non_operating_assets,
        debt=inputs.debt,
        equity_value=equity_value,
        equity_value_adjusted=equity_value_adjusted,
        shares_outstanding=inputs.shares_outstanding,
        value_per_share=value_per_share,
        fair_value_per_share=value_per_share,
    )
