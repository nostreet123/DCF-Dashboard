from __future__ import annotations

from typing import Any


def validate_seed_integrity(
    *,
    categories: list[dict[str, Any]],
    regions: list[dict[str, Any]],
    datasets: list[dict[str, Any]],
    mappings: list[dict[str, Any]],
) -> list[str]:
    errors: list[str] = []

    def _check_unique(items: list[dict[str, Any]], key: str, label: str) -> None:
        seen: set[str] = set()
        for item in items:
            value = item.get(key)
            if not isinstance(value, str):
                errors.append(f"{label}.{key} missing or non-string: {item!r}")
                continue
            if value in seen:
                errors.append(f"duplicate {label}.{key}: {value}")
            seen.add(value)

    _check_unique(categories, "slug", "category")
    _check_unique(regions, "code", "region")
    _check_unique(datasets, "key", "dataset")

    category_slugs = {c.get("slug") for c in categories if isinstance(c.get("slug"), str)}
    region_codes = {r.get("code") for r in regions if isinstance(r.get("code"), str)}
    dataset_keys = {d.get("key") for d in datasets if isinstance(d.get("key"), str)}

    for dataset in datasets:
        key = dataset.get("key")
        category_slug = dataset.get("categorySlug")
        default_region = dataset.get("defaultRegionCode")
        if isinstance(category_slug, str) and category_slug not in category_slugs:
            errors.append(
                f"dataset {key!r} references unknown categorySlug {category_slug!r}"
            )
        if isinstance(default_region, str) and default_region not in region_codes:
            errors.append(
                f"dataset {key!r} references unknown defaultRegionCode {default_region!r}"
            )

    pattern_targets: dict[tuple[str, bool], set[str]] = {}
    for mapping in mappings:
        pattern = mapping.get("pattern")
        dataset_key = mapping.get("datasetKey")
        is_regex = bool(mapping.get("isRegex"))
        if not isinstance(pattern, str) or not isinstance(dataset_key, str):
            errors.append(f"invalid mapping entry: {mapping!r}")
            continue
        if dataset_key not in dataset_keys:
            errors.append(
                f"mapping pattern {pattern!r} references unknown datasetKey {dataset_key!r}"
            )
        key = (pattern, is_regex)
        targets = pattern_targets.setdefault(key, set())
        targets.add(dataset_key)

    for (pattern, is_regex), targets in pattern_targets.items():
        if len(targets) > 1:
            errors.append(
                "mapping conflict for pattern "
                f"{pattern!r} (isRegex={is_regex}): targets={sorted(targets)!r}"
            )

    return sorted(errors)
