# Phase 6: Excel parsing and normalization


This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.


This plan follows `.agents/PLANS.md` and must be maintained in accordance with it.


## Purpose / Big Picture


After this change, the sync can parse Damodaran Excel files into a normalized table shape with deterministic sheet selection, header detection, and value normalization. This makes the downstream transform and Convex upload steps reliable. A user can verify this by parsing a sample workbook and confirming the selected sheet, header row, normalized column names, and cleaned data rows.


## Progress


- [x] (2025-12-22 16:30Z) Created this ExecPlan for Phase 6 Excel parsing work.
- [x] (2025-12-22 16:38Z) Implemented sheet selection, header detection, and normalization in `python/damodaran_sync/excel_parse.py`.
- [x] (2025-12-22 16:38Z) Added unit tests for sheet selection and value normalization.
- [x] (2025-12-22 16:38Z) Validated by running the new tests.


## Surprises & Discoveries


- None yet.


## Decision Log


- Decision: Prefer sheet names "Industry Averages", "Data", and "Sheet1" (case-insensitive) when present; otherwise select the sheet with the most non-empty rows.
  Rationale: This matches the heuristic in the launch plan while remaining deterministic for ambiguous workbooks.
  Date/Author: 2025-12-22 (Codex)

- Decision: Use conservative header detection (first row in the first 50 with a non-empty first cell and at least three non-empty cells), with fallback to the row with the highest non-empty count.
  Rationale: Prevents choosing sparse title rows while still handling sheets with unusual layouts.
  Date/Author: 2025-12-22 (Codex)


## Outcomes & Retrospective


The Excel parser now selects appropriate sheets, detects header rows, and normalizes data into a consistent table shape. Tests confirm preferred sheet selection and normalization behavior.


## Context and Orientation


`python/damodaran_sync/excel_parse.py` is currently a placeholder. Phase 6 requires heuristics for sheet selection, header row detection, and normalization of values (numbers, percentages, and empty cells). The output should include sheet metadata (sheet name, header row, column names, row count) and the list of candidates and skipped sheets for traceability.


## Plan of Work


Replace `python/damodaran_sync/excel_parse.py` with parsing logic that loads a workbook, selects the best sheet, identifies the header row, normalizes values, and returns a `ParsedTable` dataclass. Add unit tests that build small workbooks in a temp directory to validate sheet selection and normalization behaviors.


## Concrete Steps


From the repository root:

    Replace `python/damodaran_sync/excel_parse.py` with the parser implementation described above.

    Add `python/tests/test_excel_parse.py` with tests for:
      - preferred sheet name selection
      - percent and numeric string normalization
      - header row detection

    Run tests:
      PYTHONPATH=python .venv/bin/pytest -q python/tests


## Validation and Acceptance


The change is accepted when the Excel parser:

- Picks a preferred sheet name when present (even if another sheet has more rows).
- Falls back to the sheet with the most non-empty rows when no preferred sheet exists.
- Normalizes numeric, percent, and empty values as specified.

All tests must pass.


## Idempotence and Recovery


Parsing is read-only and deterministic. Re-running parsing on the same file yields the same output. Test workbooks are created under temporary directories and cleaned automatically.


## Artifacts and Notes


No external artifacts are required beyond the updated Python module and tests.


## Interfaces and Dependencies


`excel_parse.py` should expose:

    @dataclass ParsedTable
    def parse_excel(path: str | Path) -> ParsedTable


## Plan Change Notes


2025-12-22: Marked implementation and validation complete after adding the parser and tests.
