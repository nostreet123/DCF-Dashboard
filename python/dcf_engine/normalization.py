from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Literal

from dcf_engine.reference.provider import ReferenceProvider, RowRef
from dcf_engine.reference.profiles.base import MetricResolution
from dcf_engine.reference.profiles import wacc as wacc_profile
from dcf_engine.reference.profiles import taxrate as taxrate_profile
from dcf_engine.reference.profiles import margin as margin_profile
from dcf_engine.schema import InputAssumptions, NormalizedAssumptions
from dcf_engine.validation import ensure_list_length


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
    sources: dict[str, str] = field(default_factory=dict)


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
    row: RowRef,
    candidate_columns: list[str],
) -> str:
    snapshot = row.snapshot
    return (
        "Unable to resolve reference column "
        f"(dataset={dataset_key}, snapshot_id={snapshot.snapshot_id}, "
        f"as_of_date={snapshot.as_of_date}, "
        f"columns_tried={candidate_columns})"
    )


def _resolve_reference_metric(
    provided_values: list[float] | None,
    *,
    provider: ReferenceProvider,
    selector: ReferenceSelector,
    periods: int,
    dataset_key: str,
    candidate_columns: list[str],
    resolver: Callable[[RowRef], MetricResolution | None],
) -> tuple[list[float], MetricProvenance | None]:
    if provided_values is not None:
        return provided_values, None

    row, metric = _resolve_row(provider, dataset_key, selector) or (None, None)
    if row is None:
        raise ValueError(_missing_row_message(dataset_key, selector))

    resolved = resolver(row)
    if resolved is None:
        raise ValueError(_missing_column_message(dataset_key, row, candidate_columns))

    return [resolved.value] * periods, MetricProvenance(**metric, column=resolved.column)


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
        periods = inputs.periods
        required_message = "{name} is required unless --use-convex is enabled"
        ensure_list_length(
            "ebit_margin",
            inputs.ebit_margin,
            periods,
            required_message=required_message,
        )
        ensure_list_length(
            "tax_rate",
            inputs.tax_rate,
            periods,
            required_message=required_message,
        )
        ensure_list_length(
            "sales_to_capital",
            inputs.sales_to_capital,
            periods,
            required_message=required_message,
        )
        ensure_list_length(
            "wacc",
            inputs.wacc,
            periods,
            required_message=required_message,
        )
        ensure_list_length("revenue_growth", inputs.revenue_growth, periods)
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
        sources = _build_sources(inputs, normalized, set())
        return normalized, Provenance(sources=sources)

    provenance = Provenance()
    periods = inputs.periods
    filled_from_convex: set[str] = set()

    wacc, wacc_metric = _resolve_reference_metric(
        inputs.wacc,
        provider=provider,
        selector=selector,
        periods=periods,
        dataset_key=wacc_profile.DATASET_KEY,
        candidate_columns=wacc_profile.CANDIDATE_COLUMNS,
        resolver=wacc_profile.resolve_wacc,
    )
    if wacc_metric is not None:
        filled_from_convex.add("wacc")

    tax_rate, tax_rate_metric = _resolve_reference_metric(
        inputs.tax_rate,
        provider=provider,
        selector=selector,
        periods=periods,
        dataset_key=taxrate_profile.DATASET_KEY,
        candidate_columns=taxrate_profile.CANDIDATE_COLUMNS,
        resolver=taxrate_profile.resolve_tax_rate,
    )
    if tax_rate_metric is not None:
        filled_from_convex.add("tax_rate")

    ebit_margin, ebit_margin_metric = _resolve_reference_metric(
        inputs.ebit_margin,
        provider=provider,
        selector=selector,
        periods=periods,
        dataset_key=margin_profile.DATASET_KEY,
        candidate_columns=margin_profile.CANDIDATE_COLUMNS,
        resolver=margin_profile.resolve_margin,
    )
    if ebit_margin_metric is not None:
        filled_from_convex.add("ebit_margin")

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
    sources = _build_sources(inputs, normalized, filled_from_convex)
    provenance = Provenance(
        wacc=wacc_metric,
        tax_rate=tax_rate_metric,
        ebit_margin=ebit_margin_metric,
        beta=provenance.beta,
        sources=sources,
    )
    return normalized, provenance


def _build_sources(
    inputs: InputAssumptions,
    normalized: NormalizedAssumptions,
    filled_from_convex: set[str],
) -> dict[str, str]:
    sources: dict[str, str] = {}
    fields_set = inputs.model_fields_set
    for name in NormalizedAssumptions.model_fields:
        if name in filled_from_convex:
            sources[name] = "convex"
        elif name in fields_set:
            sources[name] = "user"
        else:
            sources[name] = "default"
    return sources
