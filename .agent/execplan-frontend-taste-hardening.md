# Frontend hardening and taste-skill alignment for the DCF dashboard

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.agent/PLANS.md`.

## Purpose / Big Picture

The current dashboard already renders and has a coherent visual language, but it has a few high-impact UX faults: one modal does not behave like a modal for keyboard users, slider focus is not visible, viewport sizing still uses `100vh` in layout-critical places, and the dashboard stores error state without showing it to the user. After this work, the dashboard should feel more trustworthy and more intentional: mobile layout should stop jumping on browser chrome changes, loading and failure states should read clearly, and the design system should be tightened toward the `design-taste-frontend` rubric without doing a risky whole-app rewrite.

A user should be able to run the app, open search on mobile, tab through the search dialog without escaping it, adjust assumptions with visible keyboard focus, trigger a failed search or compute path and see inline feedback, and resize between mobile and desktop without awkward viewport clipping. The visual system should also move toward one accent color, sans-serif dashboard typography, cleaner data grouping, and less prototype-like chrome.

## Progress

- [x] 2026-03-07 00:00Z: Reviewed the current frontend in code and in rendered desktop/mobile screenshots.
- [x] 2026-03-07 00:00Z: Identified the first-pass implementation order: accessibility and error-state correctness first, layout hardening second, visual-system cleanup third, architecture/dependency decisions last.
- [x] 2026-03-07 00:00Z: Drafted this ExecPlan in `.agent/execplan-frontend-taste-hardening.md`.
- [x] 2026-03-07 00:00Z: Implemented Sprint 1 accessibility and state correctness changes (modal focus trap, slider focus visibility, inline workspace error/search feedback, and right-panel skeleton loading treatment).
- [x] 2026-03-07 00:00Z: Implemented Sprint 2 responsive shell and viewport hardening (`100dvh` sizing, wider desktop workspace, explicit shell transitions, and tactile press states).
- [x] 2026-03-07 00:00Z: Implemented Sprint 3 visual-system tightening against `design-taste-frontend` (sans-first dashboard typography, token cleanup, reduced card repetition, and standardized shell icons).
- [x] 2026-03-07 00:00Z: Completed the Sprint 4 architectural convergence pass by making `app/page.tsx` a thin server route entry and extracting the interactive dashboard into `app/DashboardClient.tsx`.
- [x] 2026-03-07 00:00Z: Re-ran Sprint 1 validation (`npm run lint`, `npm run build`, targeted Playwright desktop/mobile suites) and updated the plan with outcomes and follow-up decisions.
- [x] 2026-03-07 00:00Z: Re-ran Sprint 2 validation (`npm run lint`, `npm run build`, targeted desktop/mobile Playwright suites, and refreshed the accepted iPhone visual baseline).

## Surprises & Discoveries

- Observation: The reusable dialog hook in `lib/hooks/useDialogInteractions.ts` already supports focus trapping and scroll locking, so the search overlay likely needs wiring changes rather than a new abstraction.
  Evidence: `useDialogInteractions` accepts `containerRef`, `trapFocus`, `lockScroll`, and `restoreFocus`, and `components/ui/Drawer.tsx` already uses those options successfully.

- Observation: The frontend is not actually a Tailwind app today. It is a CSS-modules app with custom properties in `app/globals.css`.
  Evidence: `package.json` has no Tailwind dependency, and the visible UI is built from `*.module.css` files.

- Observation: The dashboard already has partial loading treatment through skeletons in the main workspace, so the plan should extend existing patterns instead of replacing them wholesale.
  Evidence: `app/page.tsx` swaps in `ValueCardSkeleton`, `SensitivitySectionSkeleton`, and `MetricsTableSkeleton` when `isComputing` is true.

- Observation: Running multiple Playwright suites in parallel can still trigger `.next` build/cache contention in this repository and produce startup failures unrelated to feature behavior.
  Evidence: Parallel `playwright` runs produced a transient `SyntaxError: Unexpected end of JSON input` during `webServer` startup; rerunning sequentially produced stable passing results.

- Observation: The iPhone visual baseline moved slightly after the shell sizing and spacing changes, but the rendered UI remained intact and the diff was limited to minor shell positioning changes.
  Evidence: `e2e/visual.pw.ts` failed with a 0.02 pixel ratio diff, and rerunning with `--update-snapshots` regenerated `e2e/visual.pw.ts-snapshots/iphone-dashboard-iphone-15-pro-max-linux.png` cleanly.

- Observation: Replacing the dashboard's serif-heavy operational typography with Geist and standardizing shell icons materially changed the accepted iPhone full-page screenshot height without introducing content loss.
  Evidence: `e2e/visual.pw.ts` failed at 430x1344 expected vs 430x1335 actual after Sprint 3; the refreshed actual image preserved all sections and showed the intended chrome/token changes, and `--update-snapshots` accepted the new baseline.

- Observation: The Sprint 4 route split is structurally clean but only a partial RSC win because providers still introduce a high-level client boundary in `app/layout.tsx`.
  Evidence: `app/page.tsx` now renders a dedicated client entry, but `app/providers.tsx` remains a `"use client"` wrapper for theme, workbench, and optional Convex state, so most hydration cost still sits above the route leaf.

## Decision Log

- Decision: Keep the first sprint focused on correctness and accessibility, not aesthetic overhaul.
  Rationale: These changes have the highest user impact, the lowest ambiguity, and they reduce risk before any design-system refactor.
  Date/Author: 2026-03-07 / Codex

- Decision: Treat full Tailwind migration as optional follow-on work rather than an immediate requirement.
  Rationale: The current app is consistently built with CSS modules. Forcing a styling-system migration before fixing state and responsiveness would add scope and churn without immediate user benefit.
  Date/Author: 2026-03-07 / Codex

- Decision: Preserve the existing dark editorial atmosphere, but tighten it toward a more technical workbench aesthetic.
  Rationale: A total visual reset would be expensive and subjective. The current look can be improved by reducing serif usage, simplifying accent usage, and removing excess card treatment.
  Date/Author: 2026-03-07 / Codex

- Decision: Standardize shell icons on `@radix-ui/react-icons` for this pass rather than keeping mixed inline SVG controls.
  Rationale: The package is small, skill-approved, visually restrained, and enough to unify the top bar, drawers, and theme toggle without introducing a larger design-system dependency.
  Date/Author: 2026-03-07 / Codex

- Decision: Surface search misses as lightweight inline status text (`searchFeedback`) instead of promoting them to global workbench error state.
  Rationale: “No match found” is expected empty-state feedback, not a system failure; rendering it as status keeps severity and user expectations aligned.
  Date/Author: 2026-03-07 / Codex

## Outcomes & Retrospective

Sprint 1 is complete. The search overlay now traps focus and locks scroll while open, sliders expose clear focus visuals for keyboard navigation, the workspace can render inline error and search-empty feedback, and right-panel loading now uses structure-matched skeleton rows instead of a spinner-only treatment. Validation passed for lint, production build, and targeted desktop/mobile Playwright suites when run sequentially.

Sprint 2 is also complete. The shell now prefers `100dvh` where layout height matters, the desktop workspace uses more of the center column, and shell interactions now use explicit transitions plus restrained press feedback instead of broad `transition: all` styling. Validation passed for lint, production build, targeted desktop/mobile Playwright suites, and an updated accepted iPhone visual baseline.

Sprint 3 is now complete. The dashboard uses sans-first operational typography via Geist, a tighter warm-gold accent system, standardized Radix shell icons, and less repetitive card chrome across the workspace while preserving the existing dark product feel. Validation passed for lint, production build, targeted desktop/mobile Playwright suites, and a refreshed accepted iPhone visual baseline after confirming the snapshot drift was an intentional visual-system change rather than a layout break.

Sprint 4 is also complete. The route entry in `app/page.tsx` is back to a thin server component, and the entire interactive dashboard tree now lives in `app/DashboardClient.tsx` as a contained client leaf. This keeps behavior unchanged while restoring a cleaner server/client boundary for future data-loading work. Validation passed for lint, production build, targeted desktop/mobile Playwright suites, and the existing iPhone visual baseline without requiring another snapshot update.

Follow-up refinement is now complete as well. `WorkbenchProvider` has been moved off the global `app/providers.tsx` wrapper and is scoped to the dashboard route tree via `app/DashboardClient.tsx`, while `ThemeProvider` remains root-scoped for shared theme consumers such as `app/charts-test/page.tsx` and `ConvexProvider` remains unchanged at root to avoid hidden future route regressions. Validation passed again for lint, production build, targeted desktop/mobile Playwright suites, and the iPhone visual baseline.

There is no further work required for this plan. The remaining architectural caveat is that `ThemeProvider` and the optional `ConvexProvider` still create a root client boundary, but narrowing those further would be a separate design decision rather than a low-risk cleanup.

## Context and Orientation

This repository uses a Next.js App Router frontend under `app/` and `components/`, with client-side state providers registered in `app/providers.tsx`. The main page is `app/page.tsx`, which currently renders the entire dashboard as a client component and pulls data and state from `lib/hooks/useDashboardController.ts`. The top shell is composed of `components/layout/TopBar.tsx`, `components/layout/LeftRail.tsx`, and `components/layout/RightPanel.tsx`. Mobile drawers and the search modal are implemented in `components/ui/Drawer.tsx` and `components/ui/SearchOverlay.tsx`, both backed by `lib/hooks/useDialogInteractions.ts`.

The workbench state is stored in `lib/contexts/WorkbenchContext.tsx`. That state already includes `isComputing` and `error`, but the current page renders only the loading branch and not an error branch. Most styling lives in `app/globals.css` and component-specific `*.module.css` files. The current typeface stack is declared in `app/fonts.ts` and includes `DM Sans`, `JetBrains Mono`, and `Instrument Serif`. That serif choice is visible across section titles and contributes to the current editorial tone.

The `design-taste-frontend` skill sets several goals that matter here even if the implementation stays in CSS modules: use stable mobile viewport sizing (`100dvh`), prefer sans-serif typography for dashboard UIs, keep accent usage disciplined, reduce generic card repetition, provide explicit loading/empty/error states, and isolate heavyweight motion or interactivity. Since this app does not currently use Tailwind, the plan should interpret those rules as product direction and architectural guidance, not as a command to rewrite the entire styling system in one pass.

## Plan of Work

### Sprint 1: Accessibility and state correctness

The first sprint should fix the parts of the app that can actively confuse or block users. Start in `components/ui/SearchOverlay.tsx`. Add a dialog container ref and wire `useDialogInteractions` with `containerRef`, `trapFocus: true`, and `lockScroll: true`, matching the working drawer pattern. Ensure the input still receives initial focus and remains selected after opening. Add a targeted Playwright test that opens the overlay on a mobile viewport, presses `Tab` repeatedly, and proves focus stays inside the dialog until it is dismissed.

Then fix slider focus in `components/ui/Slider.module.css`. Keep the native range input, but add a clear `:focus-visible` treatment to the track/thumb region so keyboard users can identify the active control. The visual style should feel intentional rather than default browser blue: use the dashboard’s accent and a restrained outline or glow that respects the current theme tokens. Add a small browser test or component assertion that the slider becomes visibly focused when tabbed to.

Next, wire visible error handling into the dashboard render path. Extend `useDashboardController` to expose `error` from `useWorkbench()`. Update `app/page.tsx` so the main workspace can branch between loading, error, and normal content. Use the existing `components/ui/ErrorState.tsx` for the first pass, but embed it inline in the workspace rather than only as a global boundary fallback. The inline copy should tell the user what failed and offer a retry path if the underlying action supports one. If search misses are currently silent, add a smaller inline empty or “no matching company” message near the top bar or search overlay so search feedback is not all-or-nothing.

Finally, replace the generic spinner-only state in `components/layout/RightPanel.tsx` with a structured loading treatment that matches the rest of the dashboard. The fastest route is to add a right-panel skeleton or per-slider skeleton rows in the same footprint as the live controls. This keeps the loading pattern aligned with the skill’s preference for shape-matched skeletons instead of a generic spinner.

At the end of Sprint 1, keyboard users should be able to navigate the search overlay and sliders safely, and users who hit a failing interaction should receive explicit inline feedback.

### Sprint 2: Responsive shell and viewport hardening

The second sprint should make the shell behave reliably on mobile and use desktop space more confidently. Replace layout-critical `100vh` and `calc(100vh - ...)` usages with `100dvh`-based sizing in `app/page.module.css`, `app/globals.css`, `components/layout/LeftRail.module.css`, and `components/layout/RightPanel.module.css`. Preserve the existing grid structure, but make sure that mobile browser chrome changes do not crop the rails, workspace, or drawers.

After the viewport fix, revisit the desktop workspace width. The current main column width in `app/page.module.css` is narrow for a three-region analytical layout. Widen the main work area in a controlled way, ideally by letting the center region expand further on large screens while keeping comfortable reading width for text. The goal is not to stretch everything edge-to-edge, but to reduce the “mobile card in a desktop frame” feeling visible in the current desktop screenshot. This can be done with a larger max width, a denser two-column composition inside the workspace, or both.

Use this sprint to standardize tactile interaction states across shell controls. Buttons in `TopBar`, `LeftRail`, `RightPanel`, and shared UI should receive a restrained `:active` transform such as a slight scale or translate so interactions feel physically grounded. While doing this, replace broad `transition: all` declarations with explicit property transitions that emphasize `transform`, `opacity`, `background-color`, `border-color`, and `box-shadow` as appropriate.

At the end of Sprint 2, the shell should resize cleanly across mobile and desktop, and the interaction model should feel more deliberate without introducing heavy animation.

### Sprint 3: Visual-system tightening against the taste skill

The third sprint should improve the dashboard’s taste and consistency without destabilizing the app. Start with typography. In `app/fonts.ts` and the CSS modules that style titles, reduce serif usage across the operational dashboard UI. A practical path is to keep `JetBrains Mono` for numbers and shift headers, labels, and section titles to the sans family. If the team still wants one editorial accent, reserve serif for a very limited brand treatment rather than section headings, side rails, and data containers.

Next, simplify the color system in `app/globals.css`. Reduce the active palette to one primary accent plus neutrals. The current gold/teal/coral set gives flexibility, but it also weakens visual hierarchy. The plan should choose one accent for primary interactive emphasis and use muted neutrals for secondary states. Heatmap colors can remain multistep because they encode data rather than brand emphasis, but badges, selection states, buttons, and focus rings should stop competing with one another.

Then reduce card overuse in the workspace. `ValueCard`, `SensitivitySection`, and `MetricsTable` all currently present as similar elevated panels. Keep hierarchy where it helps, but remove redundant borders, soften repeated shadows, and allow at least one section to become a more open grouped layout using spacing, dividers, or background separation instead of another bordered card. This should make the main workspace feel less like a stacked prototype and more like a composed analytical surface.

Also standardize icons and button language. The current app uses hand-drawn inline SVGs throughout. For consistency with the skill, choose one icon package before implementation. Since `package.json` currently includes neither allowed package, the implementation should first add one of these:

    cd /root/DCF-Dashboard
    npm install @phosphor-icons/react

or

    cd /root/DCF-Dashboard
    npm install @radix-ui/react-icons

Do not import either package until the dependency is explicitly installed. Once chosen, replace ad hoc shell icons incrementally, starting with top-bar and drawer controls. Keep stroke weight consistent.

At the end of Sprint 3, the dashboard should still feel like the same product, but more disciplined: cleaner type hierarchy, clearer accent logic, and less repetitive chrome.

### Sprint 4: Optional architectural convergence

This sprint is optional because it is more expensive and only worth doing after the earlier sprints are complete. The main candidate is splitting `app/page.tsx` so the page can return to a server-first shell with isolated client leaves. The page currently starts with `'use client'`, which means the entire dashboard page hydrates as one client component. A more taste-skill-aligned shape would keep the route and static layout server-rendered while moving stateful islands into dedicated client components such as the top bar, drawers, and workbench controller boundary.

A second optional decision is styling-system convergence. If the team wants a full `design-taste-frontend` alignment, that likely means introducing Tailwind and standardizing more of the system around it. That is a broader migration, not a cleanup task. Treat it as a separate explicit decision after Sprint 3, because it will touch build configuration, authoring patterns, and nearly every component. If the current team prefers CSS modules, document that choice and stop short of migration.

At the end of Sprint 4, either the app will have a cleaner server/client split, or the team will have an explicit recorded decision not to pursue that migration now.

## Concrete Steps

Work from the repository root unless otherwise noted.

1. Confirm the worktree before starting implementation.

    cd /root/DCF-Dashboard
    git status --short

   Expect local modifications because this repository is already in active development. Do not reset unrelated files.

2. Implement Sprint 1 in the following order.

    - Edit `components/ui/SearchOverlay.tsx`.
    - Edit `components/ui/Slider.module.css` and, if needed, `components/ui/Slider.tsx`.
    - Edit `lib/hooks/useDashboardController.ts` and `app/page.tsx` to surface inline errors.
    - Add or update tests in `e2e/` for modal focus and keyboard-visible slider behavior.

3. Validate Sprint 1.

    cd /root/DCF-Dashboard
    npm run lint
    npm run build
    npm run test:e2e
    npm run test:e2e:mobile

   Expect lint and build to pass. Expect Playwright to show the dashboard and complete desktop/mobile suites without focus-related regressions.

4. Implement Sprint 2 viewport and shell changes.

    - Edit `app/page.module.css`.
    - Edit `app/globals.css`.
    - Edit `components/layout/LeftRail.module.css`.
    - Edit `components/layout/RightPanel.module.css`.
    - Edit shell CSS modules that still use `transition: all`.

5. Validate Sprint 2.

    cd /root/DCF-Dashboard
    npm run lint
    npm run build
    npm run test:e2e:mobile
    npm run test:e2e:iphone

   Expect no mobile clipping and stable top/bottom UI in screenshots.

6. Implement Sprint 3 design cleanup.

    - Edit `app/fonts.ts` and typography declarations in affected CSS modules.
    - Edit `app/globals.css` to simplify accent tokens.
    - Edit `components/workspace/ValueCard.module.css`, `components/workspace/SensitivitySection.module.css`, and `components/workspace/MetricsTable.module.css` to reduce repeated card treatment.
    - If adopting an icon library, install it first and then replace selected inline SVGs in `components/layout/TopBar.tsx`, `components/ui/Drawer.tsx`, and `components/ui/ThemeToggle.tsx`.

7. Validate Sprint 3.

    cd /root/DCF-Dashboard
    npm run lint
    npm run build
    npm run test:e2e
    npm run test:e2e:iphone

   Expect the same workflows to pass, with refreshed screenshots only if the new appearance is intentionally accepted.

8. If Sprint 4 is approved, prototype the page split and validate it separately.

    cd /root/DCF-Dashboard
    npm run lint
    npm run build
    npm run test:e2e

## Validation and Acceptance

Acceptance for Sprint 1 is behavioral. On mobile, opening search should focus the input and keep keyboard focus inside the dialog until the user closes it. On desktop or mobile, tabbing to an assumption slider should show a visible focus treatment. When the dashboard enters an error state, the workspace should show a clear inline error block rather than silently continuing with stale content. When the assumptions area is loading, the user should see shape-matched placeholders instead of only a spinner.

Acceptance for Sprint 2 is responsive. The app should not visibly jump or crop when mobile browser chrome appears or disappears. Desktop should use more of the available central canvas without looking stretched. Button press states should feel tactile and restrained.

Acceptance for Sprint 3 is visual. The dashboard should use sans-serif typography for operational UI, one primary accent for interactive emphasis, and less repeated bordered-card styling in the main workspace. The visual tone should remain premium and dark, but more technical and less editorial.

Acceptance for Sprint 4 is architectural. Either `app/page.tsx` becomes a thinner server entry point with isolated client leaves, or the repo contains a documented decision not to do that migration now.

## Idempotence and Recovery

All file edits in this plan are repeatable. Re-running lint, build, and Playwright commands is safe. If a screenshot baseline changes intentionally, update only the baselines affected by accepted visual changes and record that decision in this plan. If an experiment in Sprint 3 or 4 becomes too large, stop after the last passing sprint and leave the remaining sprint unchecked in `Progress` rather than partially rewriting the styling system.

Because the worktree is already dirty, recovery means reverting only the files changed for this feature, not resetting the full repository. Use `git diff -- <path>` to inspect individual file changes before any rollback.

## Artifacts and Notes

Useful files to keep open during implementation:

- `app/page.tsx` and `app/page.module.css` for workspace composition.
- `components/ui/SearchOverlay.tsx` and `lib/hooks/useDialogInteractions.ts` for modal behavior.
- `components/ui/Slider.tsx` and `components/ui/Slider.module.css` for form accessibility.
- `lib/contexts/WorkbenchContext.tsx` and `lib/hooks/useDashboardController.ts` for loading and error state flow.
- `app/globals.css` and `app/fonts.ts` for system-level design tokens.

Expected dependency note for icon standardization:

    package.json currently does not list `@phosphor-icons/react` or `@radix-ui/react-icons`.
    Install exactly one package before replacing inline SVGs.

Plan change note: Created on 2026-03-07 after a read-only frontend review and screenshot pass so implementation can proceed in risk-reducing order rather than as a broad redesign.
Plan change note: Updated on 2026-03-07 after Sprint 1 implementation and validation to reflect completed progress, discoveries, and decisions.
Plan change note: Updated on 2026-03-07 after Sprint 2 implementation and validation to reflect shell hardening progress and the accepted refreshed iPhone visual baseline.
Plan change note: Updated on 2026-03-07 after Sprint 3 implementation and validation to reflect typography/token cleanup, Radix icon adoption, and the accepted refreshed iPhone visual baseline.
Plan change note: Updated on 2026-03-07 after Sprint 4 implementation and validation to reflect the server-route/client-leaf split and the remaining provider-boundary caveat.
Plan change note: Updated on 2026-03-07 after the follow-up provider-depth pass to reflect dashboard-only `WorkbenchProvider` scoping while keeping shared theme and Convex boundaries intact.

## Interfaces and Dependencies

The existing interface surface should remain stable unless Sprint 4 is approved. `useDashboardController()` should continue to be the main page-facing hook, but it must expose `error` in addition to existing values. `SearchOverlay` should keep its public props (`open`, `value`, `onChange`, `onSubmit`, `onClose`, `inputRef`) while becoming a true modal internally. `Slider` should keep its existing API and gain only styling and accessibility improvements, not a new external contract.

If an icon package is added, use only one of the skill-approved packages and standardize its stroke weight in the components that adopt it. Do not add Framer Motion, GSAP, or Three.js during the first three sprints. Motion in those sprints should stay CSS-level and limited to transform/opacity-safe interactions.
