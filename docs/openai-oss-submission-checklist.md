# OpenAI OSS Program Submission Checklist

Use this before submitting DCF Dashboard to an OpenAI open-source program that requires a public GitHub repository.

## Repository Visibility

- [ ] Commit and push the public-readiness cleanup.
- [ ] Confirm `main` is protected with required CI checks and code-owner review.
- [ ] Confirm `npm run harness:verify` passes on the submitted commit.
- [ ] Confirm `npm run harness:e2e:smoke` passes on the submitted commit.
- [ ] Confirm the GitHub repository is public.
- [ ] Confirm the maintainer GitHub profile is public.

## First Impression

- [ ] README first screen explains what the project is and why it matters.
- [ ] README includes a screenshot before deep architecture details.
- [ ] README has a no-secret demo path that works in minutes.
- [ ] README clearly says public preview, not production SaaS.
- [ ] Release notes for `v0.1.0` are visible: https://github.com/nostreet123/DCF-Dashboard/releases/tag/v0.1.0
- [ ] Roadmap has concrete public-preview follow-up work.

## Maintainer Evidence

- [ ] Branch protection requires CI before merge.
- [ ] Security policy is present.
- [ ] Contributing guide is present.
- [ ] Issue templates are present.
- [ ] Dependabot is enabled for npm, GitHub Actions, and pip.
- [ ] Follow-up issues exist for contributor onboarding, sample valuations, Python dependency audit, hosted demo notes, Monte Carlo docs, and valuation regression fixtures.

Seeded follow-up issues:

- [#118](https://github.com/nostreet123/DCF-Dashboard/issues/118) Add a Python dependency audit gate
- [#119](https://github.com/nostreet123/DCF-Dashboard/issues/119) Add a second sample valuation case and saved output artifact
- [#120](https://github.com/nostreet123/DCF-Dashboard/issues/120) Improve first-time contributor onboarding after public preview
- [#121](https://github.com/nostreet123/DCF-Dashboard/issues/121) Expand Monte Carlo interpretation docs
- [#122](https://github.com/nostreet123/DCF-Dashboard/issues/122) Add valuation regression fixtures across industries
- [#123](https://github.com/nostreet123/DCF-Dashboard/issues/123) Publish hosted demo deployment notes

## Suggested Form Copy

Why does this repository qualify?

```text
DCF Dashboard is an open-source valuation workbench that turns spreadsheet-style DCF analysis into reproducible browser workflows backed by a Python valuation engine. It helps developers, students, and finance builders inspect assumptions, scenarios, Monte Carlo ranges, and audit trails. The repo is actively maintained with CI, security hardening, docs, examples, and public-preview governance.
```

How will you use API credits?

```text
I would use API credits for core OSS maintenance: Codex-assisted PR review, security scans, issue triage, release notes, docs updates, test generation, and valuation-regression workflows. Credits would also support improving AI scenario-analysis features while keeping prompts, validations, and safety boundaries auditable in the open-source repo.
```

Anything else we should know?

```text
The project is intentionally framed as a public-preview OSS workbench rather than a hosted SaaS. It has a no-secret demo mode, a Python valuation engine, public governance docs, required CI checks, and a roadmap focused on maintainability, reproducibility, and contributor onboarding.
```
