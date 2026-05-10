"""Seed data and generated mapping patterns for Damodaran dataset resolution."""
from __future__ import annotations

from damodaran_sync.dataset_mappings_seed import (
    REGIONAL_ALIAS_MAPPINGS,
    REGIONAL_BASE_DATASETS,
    REGION_LABEL_TO_CODE,
    REGION_SUFFIXES,
    SEED_CATEGORIES,
    SEED_DATASETS,
    SEED_DATASET_MAPPING_EXACT,
    SEED_REGIONS,
)


def regional_pattern(base: str) -> str:
    return rf"^{base}(?:{'|'.join(REGION_SUFFIXES)})$"


SEED_DATASET_MAPPINGS = [
    *SEED_DATASET_MAPPING_EXACT,
    {"pattern": regional_pattern("dollar"), "datasetKey": "dollar", "isRegex": True},
    {"pattern": regional_pattern("r&d"), "datasetKey": "rd", "isRegex": True},
    *[
        {"pattern": regional_pattern(base), "datasetKey": base, "isRegex": True}
        for base in REGIONAL_BASE_DATASETS
    ],
    *[
        {"pattern": regional_pattern(base), "datasetKey": dataset_key, "isRegex": True}
        for base, dataset_key in REGIONAL_ALIAS_MAPPINGS
    ],
]
