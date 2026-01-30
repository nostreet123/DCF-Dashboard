# AGENTS.md - DCF Engine

## Module Overview

The DCF engine performs Discounted Cash Flow valuations using a pure functional pipeline.

**Pipeline**: Normalize → Schedule → Forecast → Discount → Bridge

```
InputAssumptions → NormalizedAssumptions → ForecastTable → DiscountingTable → BridgeTable
                                   ↓
                           ValuationResult + Trace
```

## File Inventory

### Core Engine (`dcf_engine/`)

| File | Purpose |
|------|---------|
| `schema.py` | Pydantic models for all data structures |
| `engine.py` | `DCFEngine.run()` - main entry point |
| `normalization.py` | Input validation and normalization |
| `schedules.py` | `build_schedule()` - generates time periods |
| `forecast.py` | `build_forecast()` - revenue, EBIT, NOPAT, FCFF |
| `discounting.py` | `discount_fcff()` - PV calculations, terminal value |
| `bridge.py` | `build_bridge()` - firm value → equity value → per share |
| `cli.py` | CLI for running valuations |
| `__init__.py` | Package exports |

### IO Subpackage (`dcf_engine/io/`)

| File | Purpose |
|------|---------|
| `config_loader.py` | Loads YAML inputs into `InputAssumptions` |
| `export.py` | Exports results to CSV/JSON |

### Reference Subpackage (`dcf_engine/reference/`)

| File | Purpose |
|------|---------|
| `provider.py` | Abstract base for reference data providers |
| `convex_provider.py` | Fetches industry/country data from Convex |
| `profiles/` | Industry profiles for margins, tax rates, betas, WACC |

### Persistence Subpackage (`dcf_engine/persist/`)

| File | Purpose |
|------|---------|
| `convex_runs.py` | Saves valuation runs to Convex |

## Core Patterns

### 1. Pydantic Schema with Validation

See `schema.py`:
```bash
rg "class.*BaseModel" schema.py -A 10
```

Pattern:
- All data structures are `pydantic.BaseModel`
- Use `Field(...)` for required fields with descriptions
- Use `Field(default, ...)` for optional with defaults
- Validation via `ge=`, `gt=`, `le=`, etc.

Example from `schema.py:6-43`:
```python
class InputAssumptions(BaseModel):
    base_year: int = Field(..., description="Base year for t=0.")
    periods: int = Field(10, ge=1, description="Number of explicit forecast years.")
    revenue_t0: float = Field(..., description="Revenue at t=0.")
```

### 2. Pure Functional Pipeline

See `engine.py`:
```bash
rg "def run" engine.py -A 20
```

Pattern:
- Each stage is a pure function: `build_schedule()`, `build_forecast()`, `discount_fcff()`, `build_bridge()`
- No side effects, no I/O in core calculations
- `Trace` captures all intermediate results for debugging

### 3. Trace for Observability

See `schema.py:126-131`:
```bash
rg "class Trace" schema.py -A 10
```

Pattern:
- `Trace` bundles: `schedule`, `forecast`, `discounting`, `bridge`
- Enables debugging, auditing, and golden test comparisons
- Engine returns `(ValuationResult, Trace)` tuple

### 4. Golden Test Pattern

See `tests/test_engine_golden_acme.py`:
```bash
rg "def test_engine_golden" ../tests/test_engine_golden_acme.py -A 15
```

Pattern:
- YAML input fixtures: `fixtures/acme_inputs.yaml`
- JSON expected outputs: `fixtures/acme_expected_outputs.json`
- Test loads input, runs engine, compares to expected with tolerance
- Update golden: run engine, dump result to JSON

## Key Examples

```bash
# Find the engine entry point
rg "class DCFEngine" engine.py -A 10

# Find forecast calculations
rg "def build_forecast" forecast.py -A 5

# Find terminal value calculation
rg "terminal_value" discounting.py -B 2 -A 5

# Find bridge-to-equity calculation
rg "equity_value" bridge.py -A 3

# Find YAML config loader
rg "def load_config" io/config_loader.py -A 10
```

## Input Structure

Inputs are YAML files (see `tests/fixtures/acme_inputs.yaml`):

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

All list fields must have exactly `periods` elements.

## CLI Commands

```bash
# Run valuation from YAML config
python -m dcf_engine.cli run path/to/inputs.yaml

# Run and export to CSV
python -m dcf_engine.cli run inputs.yaml --output results.csv
```

## JIT Index Commands

```bash
# Find all Pydantic models
rg "class.*BaseModel" schema.py

# Find all Field definitions
rg "Field\(" schema.py

# Find pure functions (pipeline stages)
rg "^def build_|^def discount_" forecast.py discounting.py bridge.py schedules.py

# Find input validation
rg "_ensure_length|raise ValueError" engine.py normalization.py

# Find all list[float] fields
rg "list\[float\]" schema.py
```

## Pre-PR Checks

```bash
# Run from python/ directory
cd python && pytest tests/test_engine_golden_acme.py tests/test_engine_smoke.py tests/test_forecast_nol.py tests/test_forecast_reinvestment_lag.py tests/test_discounting.py tests/test_bridge.py tests/test_schedules.py -v
```

Checklist:
- [ ] Golden tests pass (no unexpected output changes)
- [ ] New inputs have corresponding test cases
- [ ] `from __future__ import annotations` at top
- [ ] All new fields in schema have `Field()` with description
- [ ] Pure functions have no side effects
