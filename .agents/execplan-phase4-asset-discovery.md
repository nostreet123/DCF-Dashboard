# Phase 4: Asset discovery and date parsing


This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.


This plan follows `.agents/PLANS.md` and must be maintained in accordance with it.


## Purpose / Big Picture


After this change, the Python sync can discover Damodaran Excel assets from the current and archived data pages and deterministically parse the `asOfDate` and its source/granularity. This makes later ingestion steps reliable by ensuring only assets with determinable dates are accepted. A user can verify this by running the discovery functions and seeing structured asset records with ISO dates, sources, and granularity.


## Progress


- [x] (2025-12-22 15:35Z) Created this ExecPlan for Phase 4 discovery work.
- [x] (2025-12-22 15:49Z) Implemented robust date parsing and filename inference in `python/damodaran_sync/date_parser.py`.
- [x] (2025-12-22 15:49Z) Implemented HTML discovery in `python/damodaran_sync/discover.py` with link extraction, filtering, and date resolution.
- [x] (2025-12-22 15:49Z) Replaced placeholder tests with focused unit tests for date parsing and mapping seeds.
- [x] (2025-12-22 15:49Z) Validated discovery against current and archived pages locally.


## Surprises & Discoveries


- Observation: The current page reports a last full update date of 2025-01-09, and many current-page assets use region labels, so fallback parsing is required.
  Evidence: Local discovery output showed `page_last_updated: 2025-01-09` and assets with `link_label='US'` using `as_of_date_source='page_last_update'`.


## Decision Log


- Decision: Treat link-label dates as authoritative, then fall back to page-level last update for `current` pages, and only then attempt filename inference for `archive` pages.
  Rationale: This matches the Phase 1 invariants and avoids using ambiguous filename signals when a label or page-level date exists.
  Date/Author: 2025-12-22 (Codex)

- Decision: Use conservative filename inference (month-year and year-month patterns only) and return None if multiple distinct matches are found.
  Rationale: The plan forbids synthetic dates; conservative inference prevents false positives.
  Date/Author: 2025-12-22 (Codex)


## Outcomes & Retrospective


The Phase 4 discovery and date parsing modules are implemented and validated. The discovery helper returns structured asset records with deterministic `asOfDate` values, sources, and granularity for both current and archived pages, and the new unit tests pass.


## Context and Orientation


The repository currently has placeholder Python modules in `python/damodaran_sync/`. Phase 4 requires two concrete modules: `date_parser.py` to parse `asOfDate` from link labels and filenames, and `discover.py` to crawl the `datacurrent.html` and `dataarchived.html` pages to discover Excel links. The discovery logic must only accept `.xls` and `.xlsx` assets, ignoring `.xlsm`, `.csv`, and `.zip`, and must never invent dates. The `seed:getReference` data from Convex will later be used for dataset and region resolution, but Phase 4 is limited to discovery and date parsing.


## Plan of Work


Replace `python/damodaran_sync/date_parser.py` with a small parsing library that returns both the parsed date and its granularity (day or month). Implement parsing for `M/YY`, `Month YYYY`, and `Month D, YYYY` (including labels with suffixes like "update"). Add a conservative `infer_date_from_filename` helper that extracts month/year signals from filenames only when unambiguous. Replace `python/damodaran_sync/discover.py` with a discovery module that fetches a page, extracts anchor links, filters supported Excel assets, and attaches `asOfDate`, `asOfDateSource`, and `asOfGranularity` metadata. Update tests in `python/tests/` to validate date parsing and ensure the seed mapping constants include expected cases.


## Concrete Steps


From the repository root:

    Replace `python/damodaran_sync/date_parser.py` with implementations of:
      - ParsedDate dataclass
      - parse_link_label_as_of_date(label: str) -> ParsedDate | None
      - infer_date_from_filename(filename: str) -> ParsedDate | None

    Replace `python/damodaran_sync/discover.py` with implementations of:
      - DiscoveredAsset and PageDiscovery dataclasses
      - extract_page_last_full_update(soup) -> ParsedDate | None
      - discover_page_assets(page_url, page_type) -> PageDiscovery

    Update `python/tests/test_date_parser.py` and `python/tests/test_dataset_mappings.py` with focused tests.

    (Validation) Run the discovery helper and print a few sample assets to verify date parsing.


## Validation and Acceptance


The change is accepted when the discovery logic can:

- Parse `Data of last full update: January 9, 2025` into `2025-01-09` with granularity `day`.
- Parse link labels like `1/24` or `July 2025` into month-level ISO dates.
- Ignore unsupported extensions and return assets with `asOfDate` only when deterministically inferable.

Running the discovery function against `datacurrent.html` should return assets with page-level fallback dates when the link labels are region names like "US" or "Europe".


## Idempotence and Recovery


The parsing and discovery functions are pure and idempotent. If a parse fails, the asset is returned with no date and a resolution error field; the caller can log and skip it. Rerunning discovery produces the same results given the same inputs.


## Artifacts and Notes


No external artifacts are required. The only outputs are updated Python modules and tests.


## Interfaces and Dependencies


The discovery module should rely on `requests` for HTTP, `BeautifulSoup` for HTML parsing, and the date parser helpers for deterministic date extraction. All outputs should be plain Python dataclasses suitable for later ingestion into Convex.


## Plan Change Notes


2025-12-22: Marked implementation and validation complete after running local discovery against the current and archive pages.
