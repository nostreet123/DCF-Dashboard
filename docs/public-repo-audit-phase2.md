# Phase 2 Public-Repo Audit: Dependencies and Supply Chain

Date: 2026-03-14

Status: PASS

## Summary

This repo now has one clear install path, exact top-level dependency pins, a tested Python constraints file, SHA-pinned GitHub Actions, and a clean npm audit result.

The main remaining upgrade items are intentional framework/tooling majors, not accidental drift:

- Next.js 15 / React 18 is pinned and verified.
- Python is pinned through `python/requirements.txt`, `python/requirements-dev.txt`, and `python/constraints.txt`.
- npm is the canonical package manager.
- Bun remains test/runtime tooling only.

## Dependency Inventory

JavaScript runtime:

- `@radix-ui/react-icons==1.3.2`
- `clsx==2.1.1`
- `convex==1.33.1`
- `next==15.5.12`
- `react==18.3.1`
- `react-dom==18.3.1`

JavaScript dev/test:

- `@eslint/eslintrc==3.3.5`
- `@playwright/test==1.58.2`
- `@types/node==25.5.0`
- `@types/react==18.3.28`
- `@types/react-dom==18.3.7`
- `bun-types==1.3.10`
- `convex-test==0.0.41`
- `eslint==9.39.4`
- `eslint-config-next==15.5.12`
- `typescript==5.9.3`

Python runtime:

- `convex==0.7.0`
- `python-dotenv==1.2.2`
- `requests==2.32.5`
- `beautifulsoup4==4.14.3`
- `lxml==6.0.2`
- `tenacity==9.1.4`
- `pandas==3.0.1`
- `openpyxl==3.1.5`
- `xlrd==2.0.2`
- `pydantic==2.12.5`
- `fastapi==0.135.1`
- `uvicorn[standard]==0.41.0`
- `pyyaml==6.0.3`

Python dev/test:

- `httpx==0.28.1`
- `pytest==9.0.2`

Workflow/runtime pinning:

- `.nvmrc` recommends Node 22
- `package.json` pins `packageManager: npm@11.6.2`
- `package.json` engine ranges pin Node/npm/Bun expectations
- GitHub Actions are pinned to full SHAs

## Nonstandard Sources

No npm git deps, file deps, tarball URLs, alternate registries, or missing integrity hashes were found in `package-lock.json`.

No Python VCS/path/index overrides were found in the requirements files.

Expected non-lockfile fetches that remain:

- Playwright browser binaries from `npm run test:e2e:install`
- Native-module postinstalls such as `sharp`, `esbuild`, and optional platform packages

## Remove Or Replace List

Removed:

- `tqdm` from Python requirements because it was unused in repo code
- `eval_type_backport` because the repo targets Python 3.12+
- the old cross-major `minimatch` override because it broke the modern ESLint toolchain once the stack was refreshed

Replaced:

- floating Python `>=` requirements with exact pins plus `python/constraints.txt`
- one mixed Python dependency file with split runtime/dev files
- floating GitHub Action tags with immutable SHAs
- Bun-first repo docs with npm/npx-first docs

## Upgrade List

Safe upgrades already applied in this pass:

- `convex` `1.31.x` -> `1.33.1`
- `next` `15.5.10` -> `15.5.12`
- `eslint` `9.39.3` -> `9.39.4`
- `bun-types` `1.3.9` -> `1.3.10`
- `@types/node` `25.0.10` -> `25.5.0`
- `@types/react` `18.3.3` -> `18.3.28`
- `@types/react-dom` `18.3.0` -> `18.3.7`
- pinned `codespell==2.4.2`

Deferred major upgrades to evaluate separately:

- Next.js 16 / React 19 / `eslint-config-next` 16
- `eslint` 10
- GitHub Actions latest major lines:
  - `actions/checkout` v6
  - `actions/setup-python` v6
  - `actions/setup-node` v6
  - `actions/github-script` v8

Those are not blocked by supply-chain drift now; they are compatibility migrations.

## Tested Clean Install Path

Verified on a throwaway copy of the repo on 2026-03-14 using:

- Node `v24.13.0`
- npm `11.6.2`
- Bun `1.3.6`
- Python `3.12.3`

Commands used:

```bash
npm ci
npm test
npm run lint
npm run build
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r python/requirements-dev.txt -c python/constraints.txt
cd python && pytest
```

Results:

- `npm audit --json`: 0 vulnerabilities
- `npm test`: 147 passing tests
- `npm run lint`: pass
- `npm run build`: pass
- `cd python && pytest`: 127 passing tests

## Pass Condition

Pass condition satisfied.

A stranger cloning the repo now gets a reproducible, documented install path with pinned manifests, SHA-pinned workflows, no nonstandard dependency sources, and successful clean-install verification.
