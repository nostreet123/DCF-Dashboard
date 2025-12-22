# Phase 2: Convex data model schema


This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.


This plan follows `.agents/PLANS.md` and must be maintained in accordance with it.


## Purpose / Big Picture


After this change, the Convex backend has a concrete, validated schema that matches the Damodaran data model. This removes the current `schema.ts` placeholder and allows `bunx convex dev` to start without schema errors. A user can verify this by running the Convex dev server and seeing a successful schema push.


## Progress


- [x] (2025-12-22 14:39Z) Created this ExecPlan for Phase 2 schema work.
- [x] (2025-12-22 14:43Z) Implemented the Convex schema in `convex/schema.ts` with enum-style validation for key fields.
- [x] (2025-12-22 14:41Z) Validated that `bunx convex dev` pushes the schema without `MissingSchemaExportError`.


## Surprises & Discoveries


- Observation: `bunx convex dev` failed because `convex/schema.ts` was a placeholder without a default export.
  Evidence: `MissingSchemaExportError` during the dev server run in Phase 1.
- Observation: Convex warned about `/tmp` and the project directory being on different filesystems during the schema push.
  Evidence: Warning text during `bunx convex dev` about setting `CONVEX_TMPDIR`.


## Decision Log


- Decision: Use enum-style validation (`v.literal` + `v.union`) for fields like `dataType`, `pageType`, `storageType`, and `asOfGranularity`.
  Rationale: The launchpad review findings require enum-style validation to avoid drift and to fail fast on invalid values.
  Date/Author: 2025-12-22 (Codex)


## Outcomes & Retrospective


The schema is now fully defined in `convex/schema.ts`, and the local Convex deployment accepts it without schema export errors. The Phase 2 acceptance condition was met by running `bunx convex dev` and observing successful index creation.


## Context and Orientation


The repository currently contains a placeholder `convex/schema.ts` created in Phase 1. Convex requires a default export from `convex/schema.ts` that defines all tables and indexes. The target schema is specified in `Launchpad.md` under Phase 2 and includes tables for reference data (categories, regions, datasets, datasetMappings), snapshot metadata (snapshots), row storage (tableData), operational logging (syncLogs, syncErrors), and optional asset coverage (assets). The schema should also encode known enums as unions of literals for validation.


## Plan of Work


Edit `convex/schema.ts` to replace the placeholder with the full schema definition from Phase 2 of `Launchpad.md`. Define reusable enum validators (e.g., `dataType`, `pageType`, `storageType`, `asOfGranularity`, `syncStatus`, `syncStage`, `dataStatus`, and `asOfDateSource`) using `v.union` and `v.literal`. Use those validators in the relevant table fields. Preserve all indexes and field names exactly as described so that later phases can depend on them without changes.


## Concrete Steps


From the repository root:

    Replace `convex/schema.ts` with the full schema definition (see Plan of Work).

    (Optional validation) Run:
      export PATH="$HOME/.bun/bin:$PATH"
      bunx convex dev

    Expected outcome: the dev server starts without the `MissingSchemaExportError` message, and the schema upload succeeds.


## Validation and Acceptance


The change is accepted when `bunx convex dev` can start and complete the schema push without reporting a missing default export or schema evaluation error. This confirms that the schema file is valid and Convex can build the backend from it.


## Idempotence and Recovery


Reapplying the schema edit is safe and idempotent: the file content is deterministic. If `bunx convex dev` fails, re-open `convex/schema.ts` and verify the default export and enum definitions before retrying.


## Artifacts and Notes


No external artifacts are produced beyond the updated `convex/schema.ts` file.


## Interfaces and Dependencies


In `convex/schema.ts`, define and export the default schema using:

    import { defineSchema, defineTable } from "convex/server";
    import { v } from "convex/values";

The exported schema must contain the tables and indexes described in Phase 2 of `Launchpad.md`.


## Plan Change Notes


2025-12-22: Marked validation complete after a successful `bunx convex dev` run and recorded the filesystem temp directory warning in Surprises & Discoveries.
