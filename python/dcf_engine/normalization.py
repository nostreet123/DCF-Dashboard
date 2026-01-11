from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from dcf_engine.reference.provider import ReferenceProvider
from dcf_engine.reference.profiles import wacc as wacc_profile
from dcf_engine.reference.profiles import taxrate as taxrate_profile
from dcf_engine.reference.profiles import margin as margin_profile
from dcf_engine.reference.profiles import betas as betas_profile
from dcf_engine.schema import InputAssumptions, NormalizedAssumptions


ReferencePolicy = Literal["latest", "at_or_before"]


@dataclass(frozen=True)
class MetricProvenance:
    dataset_key: str
    region_code: str
    snapshot_id: str
    as_of_date: str
    active_build_id: str
    primary_key_norm: str
    column: str


@dataclass(frozen=True)
class Provenance:
    wacc: MetricProvenance | None = None
    tax_rate: MetricProvenance | None = None
    ebit_margin: MetricProvenance | None = None
    beta: MetricProvenance | None = None


@dataclass(frozen=True)
class ReferenceSelector:
    primary_key_norm: str
    region_code: str
    as_of_date: str | None
    policy: ReferencePolicy = "latest"


def _resolve_row(
    provider: ReferenceProvider,
    dataset_key: str,
    selector: ReferenceSelector,
) -> tuple[object, dict[str, str]] | None:
    as_of_date = selector.as_of_date
    if selector.policy == "latest":
        as_of_date = None
    row = provider.get_row(
        dataset_key,
        selector.region_code,
        as_of_date,
        selector.primary_key_norm,
    )
    if row is None:
        return None
    snapshot = row.snapshot
    return row, {
        "dataset_key": dataset_key,
        "region_code": snapshot.region_code,
        "snapshot_id": snapshot.snapshot_id,
        "as_of_date": snapshot.as_of_date,
        "active_build_id": snapshot.active_build_id,
        "primary_key_norm": selector.primary_key_norm,
    }


def _missing_row_message(dataset_key: str, selector: ReferenceSelector) -> str:
    return (
        "Missing reference row "
        f"(dataset={dataset_key}, region={selector.region_code}, "
        f"primary_key_norm={selector.primary_key_norm}, policy={selector.policy}, "
        f"as_of_date={selector.as_of_date})"
    )


def _missing_column_message(
    dataset_key: str,
    row: object,
    candidate_columns: list[str],
) -> str:
    snapshot = row.snapshot
    return (
        "Unable to resolve reference column "
        f"(dataset={dataset_key}, snapshot_id={snapshot.snapshot_id}, "
        f"as_of_date={snapshot.as_of_date}, "
        f"columns_tried={candidate_columns})"
    )


def normalize_inputs(
    inputs: InputAssumptions,
    provider: ReferenceProvider | None,
    selector: ReferenceSelector | None = None,
) -> tuple[NormalizedAssumptions, Provenance]:
    if inputs.revenue_growth is None:
        raise ValueError("revenue_growth is required")
    if inputs.sales_to_capital is None:
        raise ValueError("sales_to_capital is required")
    if provider is None or selector is None:
        normalized = NormalizedAssumptions(
            base_year=inputs.base_year,
            periods=inputs.periods,
            currency=inputs.currency,
            revenue_t0=inputs.revenue_t0,
            revenue_growth=inputs.revenue_growth,
            ebit_margin=inputs.ebit_margin,
            tax_rate=inputs.tax_rate,
            sales_to_capital=inputs.sales_to_capital,
            reinvestment_lag_years=inputs.reinvestment_lag_years,
            wacc=inputs.wacc,
            g_stable=inputs.g_stable,
            wacc_stable=inputs.wacc_stable,
            cash=inputs.cash,
            debt=inputs.debt,
            other_non_operating_assets=inputs.other_non_operating_assets,
            shares_outstanding=inputs.shares_outstanding,
            failure_probability=inputs.failure_probability,
            distress_recovery_fraction=inputs.distress_recovery_fraction,
        )
        return normalized, Provenance()

    provenance = Provenance()
    periods = inputs.periods

    wacc = inputs.wacc
    if wacc is None:
        row, metric = _resolve_row(provider, wacc_profile.DATASET_KEY, selector) or (None, None)
        if row is None:
            raise ValueError(_missing_row_message(wacc_profile.DATASET_KEY, selector))
        resolved = wacc_profile.resolve_wacc(row)
        if resolved is None:
            raise ValueError(
                _missing_column_message(
                    wacc_profile.DATASET_KEY,
                    row,
                    wacc_profile.CANDIDATE_COLUMNS,
                )
            )
        wacc = [resolved.value] * periods
        provenance = Provenance(
            wacc=MetricProvenance(**metric, column=resolved.column),
            tax_rate=provenance.tax_rate,
            ebit_margin=provenance.ebit_margin,
            beta=provenance.beta,
        )

    tax_rate = inputs.tax_rate
    if tax_rate is None:
        row, metric = _resolve_row(provider, taxrate_profile.DATASET_KEY, selector) or (None, None)
        if row is None:
            raise ValueError(_missing_row_message(taxrate_profile.DATASET_KEY, selector))
        resolved = taxrate_profile.resolve_tax_rate(row)
        if resolved is None:
            raise ValueError(
                _missing_column_message(
                    taxrate_profile.DATASET_KEY,
                    row,
                    taxrate_profile.CANDIDATE_COLUMNS,
                )
            )
        tax_rate = [resolved.value] * periods
        provenance = Provenance(
            wacc=provenance.wacc,
            tax_rate=MetricProvenance(**metric, column=resolved.column),
            ebit_margin=provenance.ebit_margin,
            beta=provenance.beta,
        )

    ebit_margin = inputs.ebit_margin
    if ebit_margin is None:
        row, metric = _resolve_row(provider, margin_profile.DATASET_KEY, selector) or (None, None)
        if row is None:
            raise ValueError(_missing_row_message(margin_profile.DATASET_KEY, selector))
        resolved = margin_profile.resolve_margin(row)
        if resolved is None:
            raise ValueError(
                _missing_column_message(
                    margin_profile.DATASET_KEY,
                    row,
                    margin_profile.CANDIDATE_COLUMNS,
                )
            )
        ebit_margin = [resolved.value] * periods
        provenance = Provenance(
            wacc=provenance.wacc,
            tax_rate=provenance.tax_rate,
            ebit_margin=MetricProvenance(**metric, column=resolved.column),
            beta=provenance.beta,
        )

    normalized = NormalizedAssumptions(
        base_year=inputs.base_year,
        periods=periods,
        currency=inputs.currency,
        revenue_t0=inputs.revenue_t0,
        revenue_growth=inputs.revenue_growth,
        ebit_margin=ebit_margin,
        tax_rate=tax_rate,
        sales_to_capital=inputs.sales_to_capital,
        reinvestment_lag_years=inputs.reinvestment_lag_years,
        wacc=wacc,
        g_stable=inputs.g_stable,
        wacc_stable=inputs.wacc_stable,
        cash=inputs.cash,
        debt=inputs.debt,
        other_non_operating_assets=inputs.other_non_operating_assets,
        shares_outstanding=inputs.shares_outstanding,
        failure_probability=inputs.failure_probability,
        distress_recovery_fraction=inputs.distress_recovery_fraction,
    )
    return normalized, provenance
