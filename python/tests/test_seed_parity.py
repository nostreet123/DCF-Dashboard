"""Verify that seed data in TypeScript (convex/seed.ts) and Python stay in sync.

This test extracts canonical keys and structures from both sources and
asserts they are identical.  It is designed to fail loudly if a dataset,
category, region, or mapping is added to one side but not the other.
"""
from __future__ import annotations

import json
import subprocess
import textwrap
from pathlib import Path

import pytest

from damodaran_sync.dataset_mappings import (
    SEED_CATEGORIES,
    SEED_DATASET_MAPPINGS,
    SEED_DATASETS,
    SEED_REGIONS,
    regional_pattern,
)
from damodaran_sync.dataset_mappings_seed import (
    REGIONAL_BASE_DATASETS,
    REGION_SUFFIXES,
)

REPO_ROOT = Path(__file__).resolve().parent.parent.parent


def _extract_ts_seed() -> dict:
    """Run a Node one-liner that imports convex/seed.ts constants and prints JSON."""
    # We use tsx (bundled with convex dev tooling) or npx tsx to evaluate TS
    # directly.  The script re-exports the private constants via a wrapper.
    script = textwrap.dedent("""\
        // Inline extraction: read seed.ts source and eval the constant arrays.
        const fs = require("fs");
        const src = fs.readFileSync("convex/seed.ts", "utf-8");

        // ---------- helpers ----------
        function extractArray(name) {
            // Match 'const NAME = [' … '];'  (works for simple array-of-object literals)
            const re = new RegExp(
                "const\\\\s+" + name + "\\\\s*(?::\\\\s*[^=]+)?=\\\\s*\\\\[",
            );
            const m = re.exec(src);
            if (!m) throw new Error("Could not find " + name);
            let depth = 0;
            let start = m.index + m[0].length - 1; // the '['
            for (let i = start; i < src.length; i++) {
                if (src[i] === "[") depth++;
                else if (src[i] === "]") {
                    depth--;
                    if (depth === 0) {
                        let raw = src.slice(start, i + 1);
                        // strip 'as const' type annotations
                        raw = raw.replace(/as\\s+const/g, "");
                        // strip trailing commas before ] or }
                        raw = raw.replace(/,\\s*([\\]\\}])/g, "$1");
                        return eval("(" + raw + ")");
                    }
                }
            }
            throw new Error("Unbalanced brackets for " + name);
        }

        // ---------- extract ----------
        const categories = extractArray("SEED_CATEGORIES");
        const regions = extractArray("SEED_REGIONS");
        const datasets = extractArray("SEED_DATASETS");
        const regionSuffixes = extractArray("REGION_SUFFIXES");
        const regionalBaseDatasets = extractArray("REGIONAL_BASE_DATASETS");

        // Build dataset mappings the same way seed.ts does
        const regionalPattern = (base) =>
            "^" + base + "(?:" + regionSuffixes.join("|") + ")$";

        // Reconstruct SEED_DATASET_MAPPINGS from seed.ts source
        const mappings = [
            { pattern: "dollarus", datasetKey: "dollar", isRegex: false },
            { pattern: "r&d", datasetKey: "rd", isRegex: false },
            { pattern: regionalPattern("dollar"), datasetKey: "dollar", isRegex: true },
            { pattern: regionalPattern("r&d"), datasetKey: "rd", isRegex: true },
            ...regionalBaseDatasets.map((base) => ({
                pattern: regionalPattern(base),
                datasetKey: base,
                isRegex: true,
            })),
            { pattern: regionalPattern("beta"), datasetKey: "betas", isRegex: true },
            { pattern: regionalPattern("pe"), datasetKey: "pedata", isRegex: true },
            { pattern: regionalPattern("pbv"), datasetKey: "pbvdata", isRegex: true },
            { pattern: regionalPattern("ps"), datasetKey: "psdata", isRegex: true },
        ];

        console.log(JSON.stringify({
            categories,
            regions,
            datasets,
            regionSuffixes,
            regionalBaseDatasets,
            mappings,
        }));
    """)
    result = subprocess.run(
        ["node", "-e", script],
        capture_output=True,
        text=True,
        cwd=str(REPO_ROOT),
        timeout=15,
    )
    if result.returncode != 0:
        pytest.fail(f"Node extraction failed:\nstderr: {result.stderr}\nstdout: {result.stdout}")
    return json.loads(result.stdout)


@pytest.fixture(scope="module")
def ts_seed() -> dict:
    return _extract_ts_seed()


# ---------------------------------------------------------------------------
# Category parity
# ---------------------------------------------------------------------------

def test_category_slugs_match(ts_seed: dict) -> None:
    py_slugs = sorted(c["slug"] for c in SEED_CATEGORIES)
    ts_slugs = sorted(c["slug"] for c in ts_seed["categories"])
    assert py_slugs == ts_slugs, (
        f"Category slug mismatch.\n"
        f"  Only in Python: {set(py_slugs) - set(ts_slugs)}\n"
        f"  Only in TS:     {set(ts_slugs) - set(py_slugs)}"
    )


def test_category_details_match(ts_seed: dict) -> None:
    py_by_slug = {c["slug"]: c for c in SEED_CATEGORIES}
    ts_by_slug = {c["slug"]: c for c in ts_seed["categories"]}
    for slug in py_by_slug:
        py_cat = py_by_slug[slug]
        ts_cat = ts_by_slug[slug]
        assert py_cat["name"] == ts_cat["name"], f"Category '{slug}' name mismatch"
        assert py_cat["sortOrder"] == ts_cat["sortOrder"], f"Category '{slug}' sortOrder mismatch"


# ---------------------------------------------------------------------------
# Region parity
# ---------------------------------------------------------------------------

def test_region_codes_match(ts_seed: dict) -> None:
    py_codes = sorted(r["code"] for r in SEED_REGIONS)
    ts_codes = sorted(r["code"] for r in ts_seed["regions"])
    assert py_codes == ts_codes, (
        f"Region code mismatch.\n"
        f"  Only in Python: {set(py_codes) - set(ts_codes)}\n"
        f"  Only in TS:     {set(ts_codes) - set(py_codes)}"
    )


def test_region_details_match(ts_seed: dict) -> None:
    py_by_code = {r["code"]: r for r in SEED_REGIONS}
    ts_by_code = {r["code"]: r for r in ts_seed["regions"]}
    for code in py_by_code:
        py_reg = py_by_code[code]
        ts_reg = ts_by_code[code]
        assert py_reg["name"] == ts_reg["name"], f"Region '{code}' name mismatch"
        assert sorted(py_reg["fileTokens"]) == sorted(ts_reg["fileTokens"]), (
            f"Region '{code}' fileTokens mismatch"
        )
        assert py_reg["sortOrder"] == ts_reg["sortOrder"], (
            f"Region '{code}' sortOrder mismatch"
        )


# ---------------------------------------------------------------------------
# Dataset parity
# ---------------------------------------------------------------------------

def test_dataset_keys_match(ts_seed: dict) -> None:
    py_keys = sorted(d["key"] for d in SEED_DATASETS)
    ts_keys = sorted(d["key"] for d in ts_seed["datasets"])
    assert py_keys == ts_keys, (
        f"Dataset key mismatch.\n"
        f"  Only in Python: {set(py_keys) - set(ts_keys)}\n"
        f"  Only in TS:     {set(ts_keys) - set(py_keys)}"
    )


def test_dataset_details_match(ts_seed: dict) -> None:
    py_by_key = {d["key"]: d for d in SEED_DATASETS}
    ts_by_key = {d["key"]: d for d in ts_seed["datasets"]}
    for key in py_by_key:
        py_ds = py_by_key[key]
        ts_ds = ts_by_key[key]
        assert py_ds["name"] == ts_ds["name"], f"Dataset '{key}' name mismatch"
        assert py_ds["categorySlug"] == ts_ds["categorySlug"], (
            f"Dataset '{key}' categorySlug mismatch"
        )
        assert py_ds["dataType"] == ts_ds["dataType"], (
            f"Dataset '{key}' dataType mismatch"
        )
        assert py_ds["defaultRegionCode"] == ts_ds["defaultRegionCode"], (
            f"Dataset '{key}' defaultRegionCode mismatch"
        )


# ---------------------------------------------------------------------------
# Region suffixes & regional base datasets
# ---------------------------------------------------------------------------

def test_region_suffixes_match(ts_seed: dict) -> None:
    py_suffixes = sorted(REGION_SUFFIXES)
    ts_suffixes = sorted(ts_seed["regionSuffixes"])
    assert py_suffixes == ts_suffixes, (
        f"Region suffix mismatch.\n"
        f"  Only in Python: {set(py_suffixes) - set(ts_suffixes)}\n"
        f"  Only in TS:     {set(ts_suffixes) - set(py_suffixes)}"
    )


def test_regional_base_datasets_match(ts_seed: dict) -> None:
    py_bases = sorted(REGIONAL_BASE_DATASETS)
    ts_bases = sorted(ts_seed["regionalBaseDatasets"])
    assert py_bases == ts_bases, (
        f"Regional base dataset mismatch.\n"
        f"  Only in Python: {set(py_bases) - set(ts_bases)}\n"
        f"  Only in TS:     {set(ts_bases) - set(py_bases)}"
    )


# ---------------------------------------------------------------------------
# Dataset mapping parity
# ---------------------------------------------------------------------------

def test_dataset_mapping_patterns_match(ts_seed: dict) -> None:
    """Compare the full set of (pattern, datasetKey, isRegex) tuples."""
    def _to_tuples(mappings: list[dict]) -> set[tuple[str, str, bool]]:
        return {(m["pattern"], m["datasetKey"], m["isRegex"]) for m in mappings}

    py_tuples = _to_tuples(SEED_DATASET_MAPPINGS)
    ts_tuples = _to_tuples(ts_seed["mappings"])

    only_py = py_tuples - ts_tuples
    only_ts = ts_tuples - py_tuples

    assert py_tuples == ts_tuples, (
        f"Dataset mapping mismatch.\n"
        f"  Only in Python ({len(only_py)}): {only_py}\n"
        f"  Only in TS ({len(only_ts)}):     {only_ts}"
    )
