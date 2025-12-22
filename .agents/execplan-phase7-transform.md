# Phase 7: Transform to Convex rows


This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.


This plan follows `.agents/PLANS.md` and must be maintained in accordance with it.


## Purpose / Big Picture


After this change, parsed Excel tables can be converted into generic rows suitable for Convex storage, with deterministic primary/secondary keys, metric maps, and storage-size decisions. This enables the ingestion pipeline to choose between Convex storage and externalization without guessing. A user can verify this by transforming a parsed table and seeing the expected `primaryKey`, optional `secondaryKey`, metrics, and storage metadata.


## Progress


- [x] (2025-12-22 16:45Z) Created this ExecPlan for Phase 7 transform work.
- [x] (2025-12-22 16:50Z) Implemented transformation, secondary-key heuristic, and storage sizing in `python/damodaran_sync/transform.py`.
- [x] (2025-12-22 16:50Z) Added unit tests for secondary-key detection and storage decisions.
- [x] (2025-12-22 16:50Z) Validated by running tests.


## Surprises & Discoveries


- None yet.


## Decision Log


- Decision: Use header-based secondary-key detection with a conservative value heuristic (mostly non-numeric, low cardinality) while guarding against metric-like headers such as "count" or "%".
  Rationale: This follows the Phase 7 heuristic while avoiding misclassifying metric columns as dimensions.
  Date/Author: 2025-12-22 (Codex)

- Decision: When external storage is required, return a deterministic sample (head rows) while preserving the full row count and byte size metadata.
  Rationale: The plan requires sampling for oversized datasets and deterministic behavior.
  Date/Author: 2025-12-22 (Codex)


## Outcomes & Retrospective


The transform module now produces normalized rows with primary/secondary keys, metric maps, and storage sizing metadata. Tests confirm secondary-key detection and storage decisions for small tables.


## Context and Orientation


`python/damodaran_sync/transform.py` is currently a placeholder. Phase 7 requires converting parsed tables into rows where the first column is the primary key, an optional secondary key is chosen based on header/value heuristics, and remaining columns become a metrics dictionary. The transform also computes row counts and serialized size estimates to decide whether to store data in Convex or externalize it.


## Plan of Work


Replace `python/damodaran_sync/transform.py` with a transformation module that defines `NormalizedRow` and `TransformResult` dataclasses. Implement `transform_table(parsed)` to produce rows, determine secondary keys, compute JSON size estimates, and decide storage type. Add `python/tests/test_transform.py` to cover secondary-key detection and storage behavior. Run the test suite to validate the change.


## Concrete Steps


From the repository root:

    Replace `python/damodaran_sync/transform.py` with transformation logic and sizing helpers.

    Add `python/tests/test_transform.py` with tests for:
      - secondary key detection
      - metric column handling
      - convex storage decision for small tables

    Run tests:
      PYTHONPATH=python .venv/bin/pytest -q python/tests


## Validation and Acceptance


The change is accepted when the transform:

- Produces `primaryKey` from the first column and optional `secondaryKey` only when heuristic criteria are met.
- Preserves metric columns as a dictionary with cleaned values.
- Computes row counts and size estimates and sets `storage_type` to `convex` for small tables.

All tests must pass.


## Idempotence and Recovery


Transformation is deterministic and read-only. Re-running it yields the same output for the same parsed table. Size calculations are approximate but stable.


## Artifacts and Notes


No external artifacts are required beyond the updated Python module and tests.


## Interfaces and Dependencies


`transform.py` should expose:

    @dataclass NormalizedRow
    @dataclass TransformResult
    def transform_table(parsed: ParsedTable) -> TransformResult


## Plan Change Notes


2025-12-22: Marked implementation and validation complete after adding the transform module and tests.
