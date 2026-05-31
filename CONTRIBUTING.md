# Contributing

Thanks for taking a look at DCF Dashboard.

**Start here:** [docs/ONBOARDING.md](docs/ONBOARDING.md) for install and golden paths. **Doc index:** [docs/README.md](docs/README.md). **Help:** [SUPPORT.md](SUPPORT.md). **Releases:** [RELEASING.md](RELEASING.md).

## Before You Start

- Node `22.x` and npm `11.x` are the tested JavaScript toolchain
- Python `3.12+` is the tested backend/runtime toolchain
- `npm` is the canonical JavaScript package manager
- Bun is used only as the test runner behind the npm scripts. If it is missing, the repo harness installs the pinned version into ignored `.bun-home/`.
- `package.json` `"private": true` means the app is not published to npm; the repo is still MIT-licensed open source.

## Local Setup

See [docs/ONBOARDING.md](docs/ONBOARDING.md#install-once) for the full install block.

## Your First Pull Request

1. Fork and branch from `main` (use a focused name, for example `docs/onboarding-clarity`).
2. Run verification that matches your change (below).
3. Open a **draft** PR early if you want feedback; mark **ready for review** only when CI-relevant checks pass locally.
4. Pick the PR template that fits:
   - [bug-fix](.github/PULL_REQUEST_TEMPLATE/bug-fix.md)
   - [security-fix](.github/PULL_REQUEST_TEMPLATE/security-fix.md)
   - [feature](.github/PULL_REQUEST_TEMPLATE/feature.md)
   - [refactor](.github/PULL_REQUEST_TEMPLATE/refactor.md)
   - [docs-only](.github/PULL_REQUEST_TEMPLATE/docs-only.md)
   - [ci-tooling](.github/PULL_REQUEST_TEMPLATE/ci-tooling.md)
   - Default: [.github/pull_request_template.md](.github/pull_request_template.md)
5. Tag PR size honestly (`size/S` … `size/L`) and follow the review strategy in the template.
6. Link issues with `Fixes #123` when applicable.

## Verification

| Change type | Minimum checks |
|-------------|----------------|
| Docs only | `npm run lint` if you touched TS-adjacent config; otherwise proofread links |
| App / API | `npm run harness:verify` |
| UI routes | Add `npm run harness:e2e:smoke` |
| Python engine | `cd python && pytest` (or full harness) |
| Convex | `npm run convex:typecheck` |

```bash
. .venv/bin/activate
npm run harness:verify
npm run harness:e2e:smoke   # when UI behavior changes
```

## Issues

Use the issue templates when possible:

| Template | Use for |
|----------|---------|
| [bug_report.yml](.github/ISSUE_TEMPLATE/bug_report.yml) | Defects and regressions |
| [feature_request.yml](.github/ISSUE_TEMPLATE/feature_request.yml) | New capability |
| [documentation.yml](.github/ISSUE_TEMPLATE/documentation.yml) | Docs gaps and onboarding friction |

Suggested labels (apply in GitHub when triaging): `bug`, `documentation`, `enhancement`, `good first issue`, `help wanted`, `security`.

For security-sensitive reports, follow [`SECURITY.md`](SECURITY.md) instead of opening a public issue.

## Pull Request Expectations

- Keep changes focused; split unrelated work
- Explain user-visible impact and reviewer focus
- Add or update tests when behavior changes
- Document new env vars in `.env.example` and onboarding docs
- Never commit secrets, `.env.local`, or raw scanner output
- Use conventional commits when possible (`feat:`, `fix:`, `docs:`, `ci:`)

## Project Scope

This repository is in **public preview**. Contributions that improve setup clarity, demo quality, valuation reproducibility, documentation, and safe defaults are especially welcome.

## Repository Settings (Maintainers)

- Require approval for workflow runs from public forks before untrusted PR code executes in Actions
- Protect `main` with required checks (CI, Codespell, Secret Scan, CodeQL)
- Keep GitHub Actions default workflow permissions read-only unless a workflow needs more
- Do not use `pull_request_target` to run untrusted PR code
- Keep repository secrets out of fork PR workflows
