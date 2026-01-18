from __future__ import annotations

import re
from pathlib import Path
from damodaran_sync.dataset_mappings import REGION_LABEL_TO_CODE


def normalize_stem(file_name: str) -> str:
    """Normalize filename stem to lowercase for mapping resolution."""
    return Path(file_name).stem.lower()


def resolve_dataset_key(stem: str, mappings: list[dict]) -> tuple[str, bool]:
    """
    Resolve dataset key from filename stem using mappings.
    
    Rules:
    1. Exact mappings (isRegex=False) are checked first.
    2. Regex mappings (isRegex=True) are checked next (case-insensitive).
    3. If no mapping matches, the stem itself is used as the dataset key.
    
    Returns:
        tuple[str, bool]: (dataset_key, was_resolved)
        was_resolved is True if a mapping matched, False if fallback was used.
    """
    stem = stem.lower()

    # 1. Exact mappings
    for mapping in mappings:
        if not mapping.get("isRegex"):
            if stem == mapping["pattern"].lower():
                return mapping["datasetKey"], True

    # 2. Regex mappings
    for mapping in mappings:
        if mapping.get("isRegex"):
            if re.search(mapping["pattern"], stem, re.IGNORECASE):
                return mapping["datasetKey"], True

    # 3. Fallback
    return stem, False


def _extract_region_from_text(stem: str, dataset_key: str, regions: list[dict]) -> set[str]:
    """
    Extract region codes from stem by matching tokens using regex boundaries.
    
    Normalizes stem and dataset_key to lowercase internally.
    """
    stem_norm = stem.lower()
    dataset_key_norm = dataset_key.lower()

    search_text = stem_norm
    if stem_norm.startswith(dataset_key_norm):
        search_text = stem_norm[len(dataset_key_norm):]

    found_regions = set()

    for region in regions:
        for token in region.get("fileTokens", []):
            token_lower = token.lower()
            # Use regex boundaries to match whole tokens only.
            # We treat letters as word characters [a-z].
            # Digits, underscores and other punctuation are boundaries.
            pattern = r"(?<![a-z])" + re.escape(token_lower) + r"(?![a-z])"
            if re.search(pattern, search_text):
                found_regions.add(region["code"])

    return found_regions


def resolve_region_code(
    stem: str,
    link_label: str,
    dataset_key: str,
    datasets: dict,
    regions: list[dict],
) -> tuple[str, str | None]:
    """
    Resolve region code based on link label, filename stem, and dataset defaults.
    
    Rules:
    1. If link label is a known region label, map directly.
    2. Search region file tokens in the stem remainder using boundary matching.
       - If stem starts with datasetKey, remove it to get remainder.
       - Otherwise check full stem.
       - If multiple DIFFERENT region tokens match -> unknown.
    3. Fallback to dataset.defaultRegionCode.
    4. If still unresolved, return "unknown".
    
    Returns:
        tuple[str, str | None]: (region_code, error)
        error is None if successful, or a string description of the ambiguity/failure.
    """
    # Normalize inputs for consistent matching
    stem = stem.lower()
    dataset_key_lower = dataset_key.lower()

    # 1. Link label check
    clean_label = link_label.lower().strip()
    if clean_label in REGION_LABEL_TO_CODE:
        return REGION_LABEL_TO_CODE[clean_label], None

    # 2. Token extraction from stem
    found_regions = _extract_region_from_text(stem, dataset_key_lower, regions)

    if len(found_regions) == 1:
        return found_regions.pop(), None
    elif len(found_regions) > 1:
        return "unknown", f"ambiguous_regions_{'_'.join(sorted(found_regions))}"

    # 3. Dataset default (prefer normalized key, fallback to original casing)
    dataset = datasets.get(dataset_key_lower)
    if dataset is None and dataset_key_lower != dataset_key:
        dataset = datasets.get(dataset_key)
    if dataset and dataset.get("defaultRegionCode"):
        return dataset["defaultRegionCode"], None

    # 4. Fallback to unknown
    return "unknown", "no_region_match"
