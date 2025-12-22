from __future__ import annotations

from damodaran_sync.dataset_mappings import (
    SEED_CATEGORIES,
    SEED_DATASET_MAPPINGS,
    SEED_REGIONS,
    regional_pattern,
)


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
