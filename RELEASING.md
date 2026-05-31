# Releasing

This project follows [Semantic Versioning](https://semver.org/) for tagged releases. Application version in `package.json` tracks the user-facing release (currently `0.1.x` public preview).

## Pre-release checklist

Run on a clean checkout of `main` after merging intended changes:

```bash
npm ci
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r python/requirements-dev.txt -c python/constraints.txt
npm run harness:verify
```

Optional when UI or routes changed:

```bash
npm run harness:e2e:smoke
```

Refresh public evidence when behavior or outputs changed:

- [`docs/verification.md`](docs/verification.md) and [`docs/public-repo-audit-phase3.md`](docs/public-repo-audit-phase3.md)
- [`examples/*-demo-output.json`](examples/) if `npm run demo:compute` output changed
- [`docs/assets/`](docs/assets/) if the dashboard UI changed materially — see [`scripts/capture_showcase_screenshots.mjs`](scripts/capture_showcase_screenshots.mjs)

## Cutting a release

1. Ensure [CHANGELOG.md](CHANGELOG.md) has an `[Unreleased]` section updated (move items into a dated version heading).
2. Add or update [`docs/releases/vX.Y.Z.md`](docs/releases/) with highlights for reviewers.
3. Bump `version` in `package.json` if the release is user-visible (patch/minor per semver).
4. Commit on `main` (or a short-lived `release/vX.Y.Z` branch merged to `main`).
5. Create an annotated tag and GitHub release:

```bash
git tag -a v0.1.1 -m "v0.1.1: short summary"
git push origin v0.1.1
```

6. Publish the GitHub Release from the tag, pasting the changelog section for that version.

## Post-release

- Update [docs/verification.md](docs/verification.md) git ref row if you refreshed harness evidence for the tag.
- Close milestone issues linked in the release notes.
- Do **not** cherry-pick local-only bypass flags (`DCF_ENGINE_ALLOW_UNSIGNED`, `DCF_RATE_LIMIT_ALLOW_LOCALHOST`) into public deployment documentation.

## Hotfixes

- Patch releases (`v0.1.x`) are for regressions, security fixes, or doc corrections that do not change the public API contract.
- Security fixes may ship without a full minor bump; always document in CHANGELOG and SECURITY advisory when applicable.

## Related

- [GOVERNANCE.md](GOVERNANCE.md) — who approves releases
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) — dependency licenses
- [DEPLOY_SECURITY_RUNBOOK.md](DEPLOY_SECURITY_RUNBOOK.md) — production deployment hardening (self-hosters)
