# Public Release Checklist

Use this immediately **before** switching the repository to public visibility or announcing a major public launch. Code changes belong in PRs; this list includes maintainer-only GitHub settings from [public-release-safety-gate0.md](./public-release-safety-gate0.md).

## Code and docs (in-repo)

- [ ] `main` passes `npm run harness:verify` — evidence in [verification.md](./verification.md)
- [ ] [CHANGELOG.md](../CHANGELOG.md) reflects the release boundary
- [ ] [docs/showcase.md](./showcase.md) screenshots match current demo UI (regenerate via [scripts/capture_showcase_screenshots.mjs](../scripts/capture_showcase_screenshots.mjs) if needed)
- [ ] [examples/workbench-demo-output.json](../examples/workbench-demo-output.json) matches `npm run demo:compute`
- [ ] [oss-program-application.md](./oss-program-application.md) links only merged artifacts
- [ ] No tracked `.env` files or live secrets in the tree (see Gate 0)

## Security scan (maintainer workstation)

Run on a fresh clone at the release tag or `main` tip. For a **pre-public visibility switch**, fetch remote refs first so stale `pull/*` refs are included, then scan all reachable git history:

```bash
git fetch --all --prune

# Example: gitleaks 8.24.2
gitleaks detect --source . --no-git -v
gitleaks detect --source . -v --log-opts="--all"
```

The second command uses `git log` across **all refs** (not only the current branch). If you intentionally exclude stale PR refs, document that decision in Gate 0 instead of treating a single-branch scan as complete.

Record a **redacted** summary in [public-release-safety-gate0.md](./public-release-safety-gate0.md) (never commit raw findings with secrets).

## GitHub repository settings

- [ ] Secret scanning enabled (push protection recommended)
- [ ] CodeQL / code scanning enabled ([codeql.yml](../.github/workflows/codeql.yml) on `main`)
- [ ] Dependabot alerts enabled
- [ ] Branch protection on `main` with required checks (CI verify, secret scan, etc.)
- [ ] `SECURITY.md` published as the repository security policy
- [ ] Default branch is `main`
- [ ] Decide policy for stale `pull/*` refs from pre-cleanup history (delete or accept retention)

## Communication

- [ ] README public-preview boundary is accurate
- [ ] [SUPPORT.md](../SUPPORT.md) and issue templates are discoverable
- [ ] Release tag and [docs/releases/](./releases/) notes published if cutting a version ([RELEASING.md](../RELEASING.md))

## Sign-off

| Role | Name | Date |
|------|------|------|
| Maintainer | | |
| Security review (if separate) | | |

After sign-off, update the date on [verification.md](./verification.md) if you re-ran harness evidence for the release ref.
