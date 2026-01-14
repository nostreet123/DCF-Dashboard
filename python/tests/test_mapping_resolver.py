from damodaran_sync.mapping_resolver import normalize_stem, resolve_dataset_key, resolve_region_code

# Mock Data
MAPPINGS = [
    {"pattern": "exact_match", "datasetKey": "mapped_exact", "isRegex": False},
    {"pattern": r"^regex_.*", "datasetKey": "mapped_regex", "isRegex": True},
    {"pattern": r"case_sensitive", "datasetKey": "mapped_regex_case", "isRegex": True}, 
]

DATASETS = {
    "mapped_exact": {"defaultRegionCode": "us"},
    "mapped_regex": {"defaultRegionCode": "global"},
    "fallback_dataset": {"defaultRegionCode": "europe"},
    "no_default": {},
}

REGIONS = [
    {"code": "us", "fileTokens": ["us", "usa"]},
    {"code": "europe", "fileTokens": ["europe", "eu"]},
    {"code": "global", "fileTokens": ["global"]},
]

def test_normalize_stem():
    assert normalize_stem("File_Name.xls") == "file_name"
    assert normalize_stem("UPPERCASE") == "uppercase"
    assert normalize_stem("/path/to/file.xlsx") == "file"

def test_resolve_dataset_key_exact():
    key, resolved = resolve_dataset_key("exact_match", MAPPINGS)
    assert key == "mapped_exact"
    assert resolved is True

def test_resolve_dataset_key_regex():
    key, resolved = resolve_dataset_key("regex_test", MAPPINGS)
    assert key == "mapped_regex"
    assert resolved is True

def test_resolve_dataset_key_fallback():
    key, resolved = resolve_dataset_key("unmapped_file", MAPPINGS)
    assert key == "unmapped_file"
    assert resolved is False

def test_resolve_dataset_key_precedence():
    # If we had a regex that matched "exact_match", exact should still win.
    # Let's add a confusing mapping locally
    local_mappings = [
        {"pattern": "conflict", "datasetKey": "exact_winner", "isRegex": False},
        {"pattern": "conflict", "datasetKey": "regex_loser", "isRegex": True},
    ]
    key, resolved = resolve_dataset_key("conflict", local_mappings)
    assert key == "exact_winner"

def test_resolve_region_code_label():
    # Known label
    code, error = resolve_region_code("stem", "U.S.", "ds", DATASETS, REGIONS)
    assert code == "us"
    assert error is None

    code, error = resolve_region_code("stem", "Global", "ds", DATASETS, REGIONS)
    assert code == "global"
    assert error is None

def test_resolve_region_code_token_stem_remainder():
    # Stem starts with dataset key
    # datasetKey="mapped_regex", stem="regex_test_europe"
    # remainder = "_test_europe" -> contains "europe"
    code, error = resolve_region_code("regex_test_europe", "Download", "mapped_regex", DATASETS, REGIONS)
    assert code == "europe"
    assert error is None

def test_resolve_region_code_token_full_stem():
    # Stem does not start with dataset key
    # datasetKey="other", stem="some_file_japan" (assuming "japan" token exists in regions used)
    # Let's use 'us' from REGIONS
    code, error = resolve_region_code("some_file_usa", "Download", "other", DATASETS, REGIONS)
    assert code == "us"
    assert error is None

def test_resolve_region_code_ambiguity():
    # Stem contains both us and europe tokens
    code, error = resolve_region_code("file_us_europe", "Download", "ds", DATASETS, REGIONS)
    assert code == "unknown"
    assert "ambiguous_regions" in str(error)

def test_resolve_region_code_fallback_default():
    # No label match, no token match
    code, error = resolve_region_code("clean_file", "Download", "fallback_dataset", DATASETS, REGIONS)
    assert code == "europe"
    assert error is None

def test_resolve_region_code_fallback_unknown():
    # No label, no token, no default
    code, error = resolve_region_code("clean_file", "Download", "no_default", DATASETS, REGIONS)
    assert code == "unknown"
    assert error == "no_region_match"


def test_resolve_region_code_mixed_case():
    # Mixed case inputs should be normalized
    # DatasetKey="mapped_regex" (default global), stem="ReGeX_TeSt_EuRoPe"
    # Remainder should be "_test_europe", matching "europe"
    code, error = resolve_region_code("ReGeX_TeSt_EuRoPe", "Download", "MaPpEd_ReGeX", DATASETS, REGIONS)
    assert code == "europe"
    assert error is None


def test_resolve_region_code_substring_false_positive():
    # 'us' token should NOT match in 'business'
    # stem="business_report", datasetKey="no_default" (no default region)
    # If it matched 'us' in 'business', it would return 'us'. It should return unknown.
    code, error = resolve_region_code("business_report", "Download", "no_default", DATASETS, REGIONS)
    assert code == "unknown"
    assert error == "no_region_match"

    # 'us' token SHOULD match in 'us_report' (boundary)
    code, error = resolve_region_code("us_report", "Download", "no_default", DATASETS, REGIONS)
    assert code == "us"
    assert error is None

    # 'us' token SHOULD match in 'report_us' (boundary)
    code, error = resolve_region_code("report_us", "Download", "no_default", DATASETS, REGIONS)
    assert code == "us"
    assert error is None

    # 'us' token SHOULD match in 'report-us-data' (boundary with non-alpha)
    code, error = resolve_region_code("report-us-data", "Download", "no_default", DATASETS, REGIONS)
    assert code == "us"
    assert error is None

    # 'us' token SHOULD match in 'us2024' (boundary with digit? regex is (?![a-z]))
    # "us2024" -> 's' is followed by '2' (not [a-z]), so it should match.
    code, error = resolve_region_code("us2024", "Download", "no_default", DATASETS, REGIONS)
    assert code == "us"
    assert error is None
