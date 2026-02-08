# Lower-P Bug Hunt Board - 2026-02-08

## Status Legend
- `new`
- `confirmed`
- `in_progress`
- `fixed`
- `verified`
- `closed`

## Board

| ID | Severity | Layer | File | Repro | Owner | Status | Regression Test |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LP-2026-02-08-01 | P2 | Convex | `convex/metrics.ts` | `metrics:getCounts` query threw runtime error on live deployment. | assistant | closed | `convex_tests/metrics_source.test.ts` + live dev/prod probes |
| LP-2026-02-08-02 | P3 | Node tests | `package.json`, `test/*.test.ts` | `npm test` logged `MODULE_TYPELESS_PACKAGE_JSON` warnings. | assistant | closed | `package.json` test script update + clean run output |
| LP-2026-02-08-03 | P3 | API testability | `app/api/*`, `convex_tests/*` | Route modules were not covered by the default Node test path. | assistant | closed | `convex_tests/routeImports.bun.test.ts` via `npm run test:routes` |
| LP-2026-02-08-04 | P3 | Convex query perf | `convex/companies.ts` | Search path scanned broad candidate window; potential scale degradation. | assistant | closed | staged query strategy + live dev/prod probes |
