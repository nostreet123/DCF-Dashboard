from __future__ import annotations

from dataclasses import dataclass

from dcf_engine.normalization import ReferenceSelector, normalize_inputs
from dcf_engine.reference.provider import ReferenceProvider, RowRef, SnapshotRef
from dcf_engine.schema import InputAssumptions


@dataclass(frozen=True)
class DummyProvider(ReferenceProvider):
    def get_latest_snapshot(self, dataset_key: str, region_code: str):
        return None

    def get_snapshot_at_or_before(self, dataset_key: str, region_code: str, target_date: str):
        return None

    def get_row(
        self,
        dataset_key: str,
        region_code: str,
        as_of_date: str | None,
        primary_key_norm: str,
        secondary_key: str | None = None,
    ):
        snapshot = SnapshotRef(
            snapshot_id="snap123",
            dataset_key=dataset_key,
            region_code=region_code,
            as_of_date=as_of_date or "2026-01-09",
            active_build_id="build123",
            column_names=[],
            metrics_keys=[],
        )
        metrics = {
            "Cost of Capital": 0.1,
            "Effective tax rate": 0.25,
            "Operating Margin": 0.2,
        }
        return RowRef(
            snapshot=snapshot,
            primary_key_norm=primary_key_norm,
            secondary_key=None,
            metrics=metrics,
        )


@dataclass(frozen=True)
class DummyProviderMissing(ReferenceProvider):
    def get_latest_snapshot(self, dataset_key: str, region_code: str):
        return None

    def get_snapshot_at_or_before(self, dataset_key: str, region_code: str, target_date: str):
        return None

    def get_row(
        self,
        dataset_key: str,
        region_code: str,
        as_of_date: str | None,
        primary_key_norm: str,
        secondary_key: str | None = None,
    ):
        snapshot = SnapshotRef(
            snapshot_id="snap-missing",
            dataset_key=dataset_key,
            region_code=region_code,
            as_of_date=as_of_date or "2026-01-09",
            active_build_id="build-missing",
            column_names=[],
            metrics_keys=[],
        )
        return RowRef(
            snapshot=snapshot,
            primary_key_norm=primary_key_norm,
            secondary_key=None,
            metrics={"Unrelated Column": "n/a"},
        )


def test_normalization_resolves_missing_schedules():
    inputs = InputAssumptions(
        base_year=2024,
        currency=None,
        periods=2,
        revenue_t0=100.0,
        revenue_growth=[0.05, 0.05],
        ebit_margin=None,
        tax_rate=None,
        sales_to_capital=[2.0, 2.0],
        reinvestment_lag_years=0,
        wacc=None,
        g_stable=0.02,
        wacc_stable=0.08,
        cash=0.0,
        debt=0.0,
        other_non_operating_assets=0.0,
        shares_outstanding=10.0,
        failure_probability=None,
        distress_recovery_fraction=None,
    )

    selector = ReferenceSelector(
        primary_key_norm="software",
        region_code="us",
        as_of_date="2026-01-09",
        policy="latest",
    )

    normalized, provenance = normalize_inputs(inputs, DummyProvider(), selector)

    assert normalized.wacc == [0.1, 0.1]
    assert normalized.tax_rate == [0.25, 0.25]
    assert normalized.ebit_margin == [0.2, 0.2]
    assert provenance.wacc is not None
    assert provenance.tax_rate is not None
    assert provenance.ebit_margin is not None


def test_normalization_reports_missing_columns():
    inputs = InputAssumptions(
        base_year=2024,
        currency=None,
        periods=1,
        revenue_t0=100.0,
        revenue_growth=[0.05],
        ebit_margin=None,
        tax_rate=[0.25],
        sales_to_capital=[2.0],
        reinvestment_lag_years=0,
        wacc=None,
        g_stable=0.02,
        wacc_stable=0.08,
        cash=0.0,
        debt=0.0,
        other_non_operating_assets=0.0,
        shares_outstanding=10.0,
        failure_probability=None,
        distress_recovery_fraction=None,
    )

    selector = ReferenceSelector(
        primary_key_norm="software",
        region_code="us",
        as_of_date="2026-01-09",
        policy="latest",
    )

    try:
        normalize_inputs(inputs, DummyProviderMissing(), selector)
    except ValueError as exc:
        message = str(exc)
        assert "dataset=wacc" in message
        assert "snapshot_id=snap-missing" in message
        assert "columns_tried=" in message
    else:
        raise AssertionError("Expected missing column error")
