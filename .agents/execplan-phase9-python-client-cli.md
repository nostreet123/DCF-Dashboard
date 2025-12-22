# Phase 9: Python Convex client and CLI


This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.


This plan follows `.agents/PLANS.md` and must be maintained in accordance with it.


## Purpose / Big Picture


After this change, the Python sync can talk to Convex and expose a CLI for seeding and sync workflows. This wires together discovery, download, parsing, and transformation stages, and allows operators to trigger seed or sync runs locally or in CI. A user can verify this by running `python -m damodaran_sync.cli seed` and seeing data seeded in Convex.


## Progress


- [x] (2025-12-22 17:40Z) Created this ExecPlan for Phase 9 client/CLI work.
- [x] (2025-12-22 17:58Z) Implemented Convex client helpers in `python/damodaran_sync/convex_client.py`.
- [x] (2025-12-22 17:58Z) Implemented CLI entrypoint in `python/damodaran_sync/cli.py`.
- [x] (2025-12-22 17:58Z) Validated CLI seed command against a local Convex dev deployment.


## Surprises & Discoveries


- None yet.


## Decision Log


- Decision: Keep Convex calls in a thin wrapper that exposes typed helper methods rather than scattering API calls across modules.
  Rationale: Centralizes schema knowledge and makes testing easier.
  Date/Author: 2025-12-22 (Codex)

- Decision: Load environment variables via `python-dotenv` in the CLI for local dev convenience.
  Rationale: The plan specifies `.env` support and reduces manual export steps.
  Date/Author: 2025-12-22 (Codex)


## Outcomes & Retrospective


The Python Convex client and CLI are implemented and validated. The seed command now reaches the local Convex deployment and completes successfully.


## Context and Orientation


`python/damodaran_sync/convex_client.py` and `cli.py` are placeholders. Phase 9 requires an HTTP client for Convex calls (using the `convex` Python package) and a CLI that exposes `seed`, `sync-current`, and `sync-all` commands. The CLI should be run from `python/` and use environment variables `CONVEX_URL`, `DAMODARAN_SYNC_TOKEN`, and optional `DAMODARAN_CACHE_DIR`.


## Plan of Work


Replace `convex_client.py` with a wrapper around the Convex Python client that provides methods for seeding, fetching reference data, inserting rows, and logging sync progress. Replace `cli.py` with a basic argparse-based CLI that supports `seed`, `sync-current`, and `sync-all` (the latter two can be stubbed to log a "not yet implemented" message until later phases). Validate the `seed` command against the local Convex deployment.


## Concrete Steps


From `python/`:

    Implement `convex_client.py` with:
      - class ConvexSyncClient
      - methods: upsert_seed, get_reference, create_sync_log, increment_sync_log, finish_sync_log, append_sync_error, record_asset, upsert_snapshot, finalize_snapshot, insert_rows, delete_rows

    Implement `cli.py` with commands:
      - seed
      - sync-current
      - sync-all

    Validate:
      CONVEX_URL=<local_url> python -m damodaran_sync.cli seed


## Validation and Acceptance


The change is accepted when `python -m damodaran_sync.cli seed` can reach the local Convex dev deployment and completes without errors.


## Idempotence and Recovery


The seed command is idempotent since the Convex mutation upserts reference data. CLI commands can be rerun safely.


## Artifacts and Notes


No external artifacts are required beyond the updated Python modules.


## Interfaces and Dependencies


`convex_client.py` should depend on the `convex` Python package and expose a minimal surface for the CLI to call.


## Plan Change Notes


2025-12-22: Marked implementation and validation complete after running the CLI seed command successfully.
