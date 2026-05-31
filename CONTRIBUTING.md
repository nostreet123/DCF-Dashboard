# Contributing

Thanks for taking a look at DCF Dashboard.

The fastest way to get oriented is the [full onboarding walkthrough](docs/public-repo-audit-phase3.md), which covers golden paths, env configuration, and demo mode in one place. This file covers the mechanics of contributing once you are set up.

## Before You Start

- Node `22.x` and npm `11.x` are the tested JavaScript toolchain
- Python `3.12+` is the tested backend/runtime toolchain
- `npm` is the canonical JavaScript package manager
- Bun is used only as the test runner behind the npm scripts. If it is missing, the repo harness installs the pinned version into ignored `.bun-home/`.

## Local Setup

```bash
nvm use
npm ci
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r python/requirements-dev.txt -c python/constraints.txt
```

## Golden Paths

- UI demo: `npm run dev`
- Direct compute demo: `npm run demo:compute`
- Repo alive smoke check: `npm run smoke:alive`
- Agent/PR verification: `npm run harness:verify`

## Verification

Run the checks that match your change scope before opening a pull request.

```bash
npm run harness:verify
npm run harness:e2e:smoke
```

## Pull Requests

- Keep changes focused and explain the user-visible impact
- Prefer small, reviewable PRs over bundling unrelated work together
- Open a draft PR early if you want feedback, but switch to ready-for-review only after validation and docs are in shape
- Link the relevant issue, incident, audit note, or design doc in the PR body
- Add or update tests when behavior changes
- Include screenshots, recordings, or request/response examples when they help reviewers verify the change quickly
- Call out risk, rollback notes, env/config changes, and reviewer focus explicitly
- Use the specialized PR templates when they fit the change best (`bug-fix`, `security-fix`, `feature`, `refactor`, `docs-only`, `ci-tooling`)
- Tag the PR size honestly and follow the suggested review strategy for that size
- Before opening the PR, do a final self-review from code, security, and functionality perspectives
- Document new env vars, setup steps, or security assumptions
- Use conventional commit prefixes when possible, such as `feat:`, `fix:`, or `docs:`

## Issues

- Use the provided issue templates when possible
- For security-sensitive reports, follow [`SECURITY.md`](SECURITY.md) instead of opening a public bug
- If you are unsure whether a change belongs, start with a small issue or draft PR

## Project Scope

This repository is in public preview. Contributions that improve setup clarity, demo quality, valuation reproducibility, documentation, and safe defaults are especially helpful right now.

## Repository Settings (Maintainers)

These GitHub settings keep untrusted PR code from running with elevated access. Keep them in place:

- Require approval for workflow runs from public forks before untrusted PR code executes in Actions.
- Protect `main` with required checks and code owner review.
- Keep GitHub Actions default workflow permissions read-only unless a workflow needs more.
- Do not use `pull_request_target` to run untrusted PR code.
- Keep `CONVEX_URL` and `DAMODARAN_SYNC_TOKEN` out of PR workflows.
