# Phase 10: GitHub Actions Automation

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows .agents/PLANS.md and must be maintained in accordance with it.

## Purpose / Big Picture

Establish continuous integration and scheduled automation for the Damodaran Financial Database. The CI workflow ensures every pull request passes unit tests and spelling checks. The Weekly Sync workflow automatically updates the Convex database with new data from Professor Damodaran's site every week, ensuring the dataset remains fresh without manual intervention.

## Progress

- [x] (2025-12-23) Create `ci.yml` for running Python tests on PRs.
- [x] (2025-12-23) Create `codespell.yml` for spell checking on PRs.
- [x] (2025-12-23) Create `damodaran-weekly-sync.yml` for scheduled ingestion.

## Surprises & Discoveries

None so far.

## Decision Log

On 2025-12-23, we decided to use `pip install codespell` instead of a dedicated action to keep the workflow simple and aligned with the Python environment used elsewhere.

Also on 2025-12-23, we decided to run tests from the `python/` directory because the project structure places the python package `damodaran_sync` inside `python/`, and running from that directory simplifies module resolution.

## Outcomes & Retrospective

**Status**: Implementation Complete. Validation Pending (requires GitHub Actions runner).

The workflows are set up to provide robust gates for code quality (testing, spelling) and to operationalize the core value proposition of the repo (keeping data in sync).

## Context and Orientation

The repository contains a Python package `damodaran_sync` located in `python/`. Dependencies are listed in `python/requirements.txt`. Tests are in `python/tests/`. GitHub Actions workflows live in `.github/workflows/`.

## Plan of Work

The plan involves three main workflows. First, the CI Workflow involves creating `.github/workflows/ci.yml` to install dependencies and run `pytest`. Second, the Codespell Workflow requires creating `.github/workflows/codespell.yml` to lint for spelling errors. Finally, the Sync Workflow entails creating `.github/workflows/damodaran-weekly-sync.yml` to run the ingestion CLI on a schedule.

## Concrete Steps

See `Progress` for completed steps.

The files have been created with specific configurations. The `ci.yml` workflow uses Python 3.12, installs `python/requirements.txt`, and runs `pytest -q tests` inside the `python/` directory.

The `codespell.yml` workflow also uses Python 3.12, installs `codespell`, and runs it while excluding git, venv, node_modules, and bun.lock.

The `damodaran-weekly-sync.yml` workflow is scheduled for Sunday at 12:00 UTC, uses `CONVEX_URL` and `DAMODARAN_SYNC_TOKEN` environment variables, and runs `python -m damodaran_sync.cli sync-current` inside the `python/` directory.

## Validation and Acceptance

To validate (which requires pushing to GitHub), open a Pull Request and verify that the "CI" and "Codespell" workflows trigger and pass. For the Sync workflow, go to the "Actions" tab in GitHub, select "Damodaran Weekly Sync", click "Run workflow" (workflow_dispatch), and verify that it successfully connects to Convex and runs the sync by checking the logs.

## Idempotence and Recovery

Workflows are stateless. Re-running them is safe. The Sync workflow relies on the idempotence of the Python CLI (which handles `fileHash` checks).

## Artifacts and Notes

Workflow files are committed to `.github/workflows/`.

## Plan Change Notes

Plan created and workflows implemented. Validation is pending since GitHub Actions hasn't run yet.