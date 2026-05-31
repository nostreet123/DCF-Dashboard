# Governance

DCF Dashboard is an MIT-licensed open-source project maintained in public on GitHub. This document describes how decisions are made and how releases are stewarded.

## Project roles

| Role | Responsibility |
|------|----------------|
| **Maintainers** | Merge policy, release tags, security response, roadmap curation |
| **Contributors** | Issues, docs, code, and tests via pull request |
| **Users** | Run locally or self-host; no implied production SLA |

There is no formal foundation or corporate sponsor. Maintainer contact is through GitHub (issues and pull requests).

## Decision making

- **Day-to-day changes** land through pull request review on `main`, with CI (`npm run harness:verify`) as the default quality bar.
- **Security issues** follow [SECURITY.md](SECURITY.md) — private disclosure preferred; public fixes after coordination when needed.
- **Scope and priorities** are tracked in [ROADMAP.md](ROADMAP.md) and GitHub issues/milestones. Large or breaking changes should be discussed in an issue before a large PR.
- **Breaking API or env changes** require a changelog entry and, when user-visible, an update to [docs/ONBOARDING.md](docs/ONBOARDING.md) or [`.env.example`](.env.example).

## Release authority

Tagged releases are cut by maintainers using [RELEASING.md](RELEASING.md). Release notes live in [CHANGELOG.md](CHANGELOG.md) and [`docs/releases/`](docs/releases/).

## Conduct

All participants are expected to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Related documents

- [CONTRIBUTING.md](CONTRIBUTING.md) — how to contribute
- [SUPPORT.md](SUPPORT.md) — how to get help
- [RELEASING.md](RELEASING.md) — how maintainers ship versions
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) — dependency attribution
