# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and the project follows Semantic Versioning for tagged releases.

## [Unreleased]

### Added

- Public documentation hub ([`docs/README.md`](docs/README.md)), onboarding guide ([`docs/ONBOARDING.md`](docs/ONBOARDING.md)), and OSS impact claim ledger skeleton ([`docs/oss-impact.md`](docs/oss-impact.md))
- README sections for target users, public-preview boundary, and financial modeling disclaimer

### Changed

- Golden-path onboarding links now point at `docs/ONBOARDING.md` instead of audit-only docs
- Roadmap items include acceptance criteria for contributor-friendly follow-up work

## [0.1.0] - 2026-03-14

### Added

- Public preview docs pack, including `CONTRIBUTING.md`, `SECURITY.md`, `ROADMAP.md`, release notes, showcase material, issue templates, and a pull request template
- Five-minute quickstart, demo paths (mock UI via `NEXT_PUBLIC_DCF_DASHBOARD_MODE=demo`, live EDGAR when the Python engine is configured), and reproducible compute example
- Public audit artifacts for security, supply-chain, setup, and OSS-readiness phases

### Changed

- README rewritten for public visitors with clear prototype boundaries and optional-service guidance
- Dependency/install story clarified around npm as canonical package manager and Bun as test runner only
- Service auth and rate-limit defaults hardened for public exposure

### Fixed

- Historic secret and internal metadata exposure removed from local history and docs
- Local contributor path verified from clean install through demo, tests, and build
