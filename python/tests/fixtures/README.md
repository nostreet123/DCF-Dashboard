# Valuation Golden Fixtures

These fixtures are synthetic regression cases. They are not real companies, market data, or investment recommendations.

| Fixture | Purpose |
|---|---|
| `acme` | Baseline three-year USD valuation |
| `acme_high_growth` | Higher growth and margin profile |
| `acme_distressed` | Failure-probability and recovery adjustment |
| `consumer_staples_eur` | Mature five-year EUR case with stable margins |
| `industrial_jpy` | Capital-intensive JPY case with one-year reinvestment lag |
| `software_usd` | Six-year asset-light case with margin expansion |

`test_engine_golden_acme.py` runs every input through `DCFEngine` and compares the complete result and trace with the matching expected JSON file.
