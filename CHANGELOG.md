# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog. Tagged releases will be documented here when they are cut.

## [Unreleased]

### Added

- [`docs/oss-program-application.md`](docs/oss-program-application.md) — consolidated reviewer pack (PR 7)
- [`docs/public-release-checklist.md`](docs/public-release-checklist.md) — pre-launch maintainer checklist (PR 8)
- Root governance pack: [`GOVERNANCE.md`](GOVERNANCE.md), [`SUPPORT.md`](SUPPORT.md), [`RELEASING.md`](RELEASING.md), [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)
- [`docs/verification.md`](docs/verification.md) — reviewer-facing clean-clone evidence index (refreshed phase-3 audit on `main`)
- [`docs/architecture.md`](docs/architecture.md), [`docs/provider-data-flow.md`](docs/provider-data-flow.md), and [`examples/README.md`](examples/README.md)
- Refreshed showcase screenshots in [`docs/assets/`](docs/assets/) and maintainer capture script [`scripts/capture_showcase_screenshots.mjs`](scripts/capture_showcase_screenshots.mjs)
- Public documentation hub ([`docs/README.md`](docs/README.md)), onboarding guide ([`docs/ONBOARDING.md`](docs/ONBOARDING.md)), and OSS impact claim ledger skeleton ([`docs/oss-impact.md`](docs/oss-impact.md))
- README sections for target users, public-preview boundary, and financial modeling disclaimer

### Changed

- Showcase Monte Carlo screenshot capture targets the `Monte Carlo` details panel (not the value-card P10 label)
- OSS reviewer script splits mock UI dev server from headless verification paths
- Public release checklist documents `gitleaks` with `--log-opts="--all"` after `git fetch --all`
- `THIRD_PARTY_NOTICES.md`: add `react-dom`, correct npm `convex` license to Apache-2.0
- Golden-path onboarding links now point at `docs/ONBOARDING.md` instead of audit-only docs
- Roadmap items include acceptance criteria for contributor-friendly follow-up work
