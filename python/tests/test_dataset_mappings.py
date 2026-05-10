from __future__ import annotations

from damodaran_sync.dataset_mappings import (
    SEED_CATEGORIES,
    SEED_DATASETS,
    SEED_DATASET_MAPPINGS,
    SEED_REGIONS,
    regional_pattern,
)
from damodaran_sync.dataset_mappings_validation import validate_seed_integrity


def test_seed_categories_contains_unknown():
    slugs = {category["slug"] for category in SEED_CATEGORIES}
    assert "unknown" in slugs


def test_seed_regions_contains_core_regions():
    codes = {region["code"] for region in SEED_REGIONS}
    assert {"us", "europe", "japan", "ausnzcan", "emerging", "china", "india", "global", "unknown"}.issubset(
        codes
    )


def test_dataset_mappings_include_rd_pattern():
    patterns = {mapping["pattern"] for mapping in SEED_DATASET_MAPPINGS}
    assert "r&d" in patterns
    assert regional_pattern("r&d") in patterns


def test_seed_integrity_validation_passes_for_current_seed():
    errors = validate_seed_integrity(
        categories=SEED_CATEGORIES,
        regions=SEED_REGIONS,
        datasets=SEED_DATASETS,
        mappings=SEED_DATASET_MAPPINGS,
    )
    assert errors == []


def test_seed_integrity_detects_conflicting_mapping_targets():
    mappings = [
        {"pattern": "abc", "datasetKey": "foo", "isRegex": False},
        {"pattern": "abc", "datasetKey": "bar", "isRegex": False},
    ]
    errors = validate_seed_integrity(
        categories=[{"slug": "s"}],
        regions=[{"code": "us"}],
        datasets=[
            {"key": "foo", "categorySlug": "s", "defaultRegionCode": "us"},
            {"key": "bar", "categorySlug": "s", "defaultRegionCode": "us"},
        ],
        mappings=mappings,
    )
    assert any("mapping conflict" in e for e in errors)
