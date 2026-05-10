# DCF Dashboard Native macOS App Design

## Purpose

Build a real macOS app that preserves the DCF Dashboard workflow while feeling native on Mac. The app must install as a standalone `.app`, launch without a browser or Convex setup, reuse the existing Python valuation engine for exact calculation parity, and support internet-backed company search, native scenario analysis, sensitivity views, and local run history.

## Approved Product Decisions

- The app is macOS-native first, not a wrapped web shell.
- The app reuses the existing Python DCF engine rather than rewriting valuation logic in Swift for v1.
- The app must be distributable as a standalone `.app`, not just runnable from the repo.
- v1 scope is close parity with the current dashboard: company search/library, assumptions, scenarios, sensitivity, and local run history.
- Internet-backed company search is acceptable for v1.

## Product Scope

### Required In v1

- Native macOS main window built with SwiftUI.
- Toolbar-based search for companies and tickers.
- Sidebar with company library and saved run history.
- Center workspace showing fair value, valuation range, distribution, sensitivity, and projections.
- Inspector-style assumptions panel with editable drivers.
- Base, bull, and bear scenario switching.
- Local persistence for replayable runs.
- Embedded Python engine bundled inside the `.app`.

### Explicitly Out Of Scope In v1

- Convex-backed persistence inside the desktop app.
- Offline company search or bundled local security master.
- A native Swift valuation engine.
- Multiwindow document workflows beyond a single main window and Settings.
- Production signing and notarization as a release blocker, though the bundle structure must be ready for them.

## Architecture

The desktop app should live as a dedicated macOS codebase within this repository and be separate from the existing Next.js frontend. SwiftUI owns the app shell, windowing, local persistence, and all user interaction. The existing Python DCF engine remains the source of truth for valuation logic and is bundled into the app as a private sidecar runtime.

The key boundary is a small Swift protocol, `ValuationEngineClient`, that exposes four capabilities:

- health check
- company search
- company facts lookup
- DCF compute

The initial implementation of that protocol talks to a bundled Python process over a loopback HTTP boundary. The UI never imports Python concerns directly. This keeps the SwiftUI surface stable if the engine is later replaced or if transport changes.

## Native UI Structure

The main scene should be a `NavigationSplitView` with three conceptual regions:

- `sidebar`: company library plus recent runs
- `detail`: valuation workspace
- `inspector`: assumptions and driver context

The toolbar should contain:

- app title
- company search field
- scenario switcher
- refresh/recompute action
- settings access

The workspace should render the same workflow as the web app, but using native macOS surfaces and typography:

- fair value hero with range
- distribution chart
- sensitivity view
- financial projections table

The assumptions surface should be a real inspector, not a drawer. It should use native controls, grouped sections, and desktop keyboard behavior.

## Visual Direction

The app should inherit the restrained finance-lab identity of the current web dashboard without copying its web chrome. The sidebar and toolbar should lean on system materials and native Liquid Glass behavior where appropriate. The detail pane can carry a restrained custom palette derived from the current warm gold accent, with monospace numerics and minimal card treatment.

The design target is a serious desktop analysis tool:

- system sidebar appearance
- minimal custom chrome
- one subdued accent
- sparse, deliberate motion
- no boxed dashboard mosaic

## Runtime And Data Flow

On launch, the app initializes in this order:

1. local persistence store
2. bundled Python engine process
3. engine health state
4. user-visible workspace

The primary request flow is:

1. user searches for a company
2. Swift sends the query to the local engine client
3. Python resolves search and company facts using the existing service boundary
4. Swift assembles a typed valuation request from the active assumptions and scenario
5. Python returns fair value, range, histogram, sensitivity matrix, and projections
6. Swift renders the result and persists a replayable local snapshot

Selecting a saved run should restore that snapshot from local storage immediately without recomputation. Recompute should be explicit or assumption-driven, not required merely to read history.

## Local Persistence

Local run history should use a SwiftData-backed store, which is SQLite under the hood and native to the platform. The persisted record must contain enough information to replay the workspace offline after the search step has already happened:

- selected company summary
- assumptions
- scenario outputs
- histogram data
- sensitivity matrix
- projections
- timestamps and metadata

The history store is local-only in v1. It is the replacement for Convex-backed run history in the web app.

## Python Engine Packaging

The `.app` bundle must embed:

- a private Python runtime
- the `dcf_engine` package
- required Python dependencies
- a launch wrapper or bootstrap script

The engine should run only on localhost and only while the app is alive. The Swift app is responsible for:

- starting the process
- checking readiness
- surfacing errors clearly
- shutting the process down

The engine should not be exposed as a public network service.

## Error Handling

The desktop app must fail soft.

- If the engine fails to launch, the window still opens with an engine-offline state and retry affordance.
- If search fails, local run history remains usable.
- If compute fails, the last good run remains visible until a new one succeeds.
- If persistence fails, the app should keep the current result on screen and surface a local-save error without losing the valuation.

Errors should be mapped into desktop-appropriate copy rather than raw service strings.

## Packaging And Distribution

The initial goal is a distributable app bundle with a correct nested-binary structure and predictable launch process. The implementation should be signing-ready, meaning it uses a packaging layout that can be code signed and notarized later without a major rewrite.

The first shipping target is:

- internal ad hoc or developer distribution with a proper `.app` bundle
- embedded Python runtime
- stable launch and relaunch behavior
- no browser dependency

## Validation Criteria

The design is successful when a user can:

1. install and launch the `.app`
2. search for a company
3. run a valuation
4. change assumptions and scenarios
5. inspect sensitivity and projections
6. quit and relaunch the app
7. reopen prior saved runs from local history

Validation must include:

- Swift unit tests for state and persistence logic
- Python integration verification for engine responses
- desktop smoke tests covering launch, search, compute, replay, and relaunch

## Major Risks And Mitigations

### Bundled Python Runtime Complexity

Risk: packaging and launch of Python inside `.app` is the hardest part of the build.

Mitigation: isolate the engine as a sidecar process with a strict launch wrapper and verify the bundle structure early, before building the full UI.

### Search Availability

Risk: internet-backed search introduces an external failure mode.

Mitigation: keep local history fully usable without search and route search through one engine boundary so failures are centralized.

### State Drift Between Live Runs And Replays

Risk: desktop history may not restore the same workspace data users saw originally.

Mitigation: persist fully replayable snapshots, not just a run identifier and summary.

## Outcome

This design produces a native macOS DCF workbench that feels like a real desktop analysis product, preserves valuation correctness by reusing the Python engine, and keeps the repo’s current web app and desktop app aligned without forcing a premature engine rewrite.
