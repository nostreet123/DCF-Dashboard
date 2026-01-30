# AGENTS.md - Tests

## Test Overview

- **Framework**: pytest
- **Location**: `python/tests/`
- **Test count**: 24 test files
- **Fixtures**: `python/tests/fixtures/`

## Test Categories

### Golden Tests

Compare engine output against known-good JSON fixtures.

| File | Tests |
|------|-------|
| `test_engine_golden_acme.py` | DCF engine golden tests for ACME scenarios |

Pattern:
1. Load YAML input from `fixtures/`
2. Run engine
3. Compare output to expected JSON with tolerance

### Unit Tests

Test individual functions/modules in isolation.

| File | Module Tested |
|------|---------------|
| `test_bridge.py` | Bridge calculations (firm → equity → per share) |
| `test_discounting.py` | PV, terminal value, discount factors |
| `test_forecast_nol.py` | Net operating loss carryforward |
| `test_forecast_reinvestment_lag.py` | Reinvestment timing |
| `test_schedules.py` | Time period generation |
| `test_normalization_reference.py` | Input normalization |
| `test_date_parser.py` | Date extraction from filenames |
| `test_transform.py` | Data transformation logic |
| `test_excel_parse.py` | Excel file parsing |
| `test_dataset_mappings.py` | File → dataset resolution |
| `test_mapping_resolver.py` | Mapping resolution logic |
| `test_config_loader.py` | YAML config loading |
| `test_export_forecast_csv.py` | CSV export functionality |

### Integration Tests

Test component interactions with mocks.

| File | Components |
|------|------------|
| `test_convex_client.py` | ConvexSyncClient with mocked Convex |
| `test_convex_reference_provider.py` | Reference data provider |
| `test_persist_convex_runs.py` | Valuation persistence |
| `test_download_conditional.py` | HTTP conditional GET |
| `test_sync_performance.py` | Sync timing/performance |
| `test_engine_smoke.py` | Engine end-to-end smoke test |

## Fixture Structure

Located in `python/tests/fixtures/`:

```
fixtures/
├── acme_inputs.yaml                    # Base ACME scenario
├── acme_expected_outputs.json          # Expected result
├── acme_high_growth_inputs.yaml        # High growth variant
├── acme_high_growth_expected_outputs.json
├── acme_distressed_inputs.yaml         # Distressed company variant
└── acme_distressed_expected_outputs.json
```

### Input YAML Format

```yaml
base_year: 2024
periods: 3
revenue_t0: 100.0
revenue_growth: [0.10, 0.08, 0.05]
ebit_margin: [0.20, 0.21, 0.22]
tax_rate: [0.25, 0.25, 0.25]
sales_to_capital: [2.0, 2.0, 2.0]
wacc: [0.09, 0.09, 0.09]
g_stable: 0.02
wacc_stable: 0.08
cash: 10.0
debt: 20.0
shares_outstanding: 10.0
```

### Output JSON Format

```json
{
  "result": {
    "firm_value": 123.45,
    "value_per_share": 12.34,
    ...
  },
  "trace": {
    "schedule": {...},
    "forecast": {...},
    "discounting": {...},
    "bridge": {...}
  }
}
```

## Golden Test Pattern

See `test_engine_golden_acme.py`:

```python
@pytest.mark.parametrize("fixture_name", FIXTURES)
def test_engine_golden_acme(fixture_name: str):
    inputs, _ = load_config(str(FIXTURE_DIR / f"{fixture_name}_inputs.yaml"))
    engine = DCFEngine()
    result, trace = engine.run(inputs)
    actual = {
        "result": result.model_dump(),
        "trace": trace.model_dump(),
    }
    expected = json.loads(
        (FIXTURE_DIR / f"{fixture_name}_expected_outputs.json").read_text()
    )
    _assert_close(actual, expected)
```

Key elements:
- `pytest.mark.parametrize` for multiple fixtures
- `_assert_close()` for float tolerance comparison
- Separate input/output files for clarity

## Test Execution

```bash
# Run all tests
cd python && pytest

# Run specific test file
pytest tests/test_engine_golden_acme.py

# Run with verbose output
pytest -v

# Run tests matching pattern
pytest -k "golden"

# Run with coverage
pytest --cov=dcf_engine --cov=damodaran_sync

# Run single test
pytest tests/test_bridge.py::test_bridge_basic -v
```

## Mocking Patterns

### Mocking HTTP (requests)

```python
@pytest.fixture
def mock_response():
    response = Mock()
    response.status_code = 200
    response.iter_content.return_value = [b"data"]
    response.headers = {"ETag": "abc123"}
    return response
```

### Mocking Convex Client

```python
@pytest.fixture
def mock_convex_client():
    client = Mock(spec=ConvexSyncClient)
    client.get_snapshot_by_identity.return_value = None
    client.upsert_snapshot.return_value = SnapshotUpsertResult(...)
    return client
```

## JIT Index Commands

```bash
# Find all test functions
rg "def test_" tests/

# Find parametrized tests
rg "@pytest.mark.parametrize" tests/

# Find fixtures
rg "@pytest.fixture" tests/

# Find mock usage
rg "Mock\(|patch\(" tests/

# Find assertion helpers
rg "def _assert|assert_" tests/
```

## Pre-PR Test Checklist

```bash
# Run full test suite
cd python && pytest -v

# Check for new test files
ls tests/test_*.py | wc -l  # Should match expected count
```

Checklist:
- [ ] All tests pass
- [ ] New functionality has corresponding tests
- [ ] Golden test fixtures updated if output changed intentionally
- [ ] No hardcoded paths (use `Path(__file__).parent`)
- [ ] Mocks are properly scoped
- [ ] `from __future__ import annotations` at top
