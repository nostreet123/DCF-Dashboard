# DCF Dashboard Native macOS App Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a distributable native macOS app that reuses the existing Python DCF engine, supports internet-backed company search, and provides native local run history and analysis workflows.

**Architecture:** Create a dedicated SwiftUI desktop app under `macos/DCFDesktopApp`, isolate all Python interaction behind a Swift `ValuationEngineClient`, persist replayable runs locally with SwiftData, and bundle a private Python runtime plus engine resources inside the final `.app`.

**Tech Stack:** SwiftUI, SwiftData, Charts, URLSession, XCTest, Swift Package Manager, bundled Python 3.12 runtime, existing `python/dcf_engine` service modules.

---

### Task 1: Scaffold the macOS app and local run entrypoint

**Files:**
- Create: `macos/DCFDesktopApp/Package.swift`
- Create: `macos/DCFDesktopApp/Sources/DCFDesktopApp/App/DCFDesktopApp.swift`
- Create: `macos/DCFDesktopApp/Sources/DCFDesktopApp/App/AppScene.swift`
- Create: `macos/DCFDesktopApp/Tests/DCFDesktopAppTests/AppLaunchConfigurationTests.swift`
- Create: `script/build_and_run.sh`
- Create: `.codex/environments/environment.toml`

**Step 1: Write the failing test**

Create `macos/DCFDesktopApp/Tests/DCFDesktopAppTests/AppLaunchConfigurationTests.swift` with a test that expects the app to expose a single named main window configuration and a settings scene descriptor through a tiny pure-Swift configuration type.

**Step 2: Run test to verify it fails**

Run: `cd macos/DCFDesktopApp && swift test --filter AppLaunchConfigurationTests`
Expected: FAIL because the package and configuration types do not exist yet.

**Step 3: Write minimal implementation**

Create the Swift package, add a minimal SwiftUI app target, define the window/settings configuration type, add `script/build_and_run.sh`, and point `.codex/environments/environment.toml` at that script.

**Step 4: Run test to verify it passes**

Run:
- `cd macos/DCFDesktopApp && swift test --filter AppLaunchConfigurationTests`
- `./script/build_and_run.sh --verify`

Expected:
- Swift test PASS
- verify mode confirms the app bundle builds and a process can be launched

**Step 5: Commit**

```bash
git add macos/DCFDesktopApp script/build_and_run.sh .codex/environments/environment.toml
git commit -m "feat: scaffold native mac app shell"
```

### Task 2: Add engine-side request and response contracts

**Files:**
- Create: `macos/DCFDesktopApp/Sources/DCFDesktopApp/Models/CompanySummary.swift`
- Create: `macos/DCFDesktopApp/Sources/DCFDesktopApp/Models/ValuationRequest.swift`
- Create: `macos/DCFDesktopApp/Sources/DCFDesktopApp/Models/ValuationResponse.swift`
- Create: `macos/DCFDesktopApp/Tests/DCFDesktopAppTests/ValuationContractDecodingTests.swift`
- Reference: `python/dcf_engine/workbench/schema.py`
- Reference: `examples/workbench-demo-request.json`
- Reference: `examples/workbench-demo-output.json`

**Step 1: Write the failing test**

Add decoding and encoding tests that:
- decode `examples/workbench-demo-output.json` into `ValuationResponse`
- encode a `ValuationRequest` that matches the shape of `examples/workbench-demo-request.json`

**Step 2: Run test to verify it fails**

Run: `cd macos/DCFDesktopApp && swift test --filter ValuationContractDecodingTests`
Expected: FAIL because the model files do not exist.

**Step 3: Write minimal implementation**

Create Codable Swift models that mirror the current engine contract without adding desktop-only fields.

**Step 4: Run test to verify it passes**

Run: `cd macos/DCFDesktopApp && swift test --filter ValuationContractDecodingTests`
Expected: PASS and the fixture payloads decode cleanly.

**Step 5: Commit**

```bash
git add macos/DCFDesktopApp/Sources/DCFDesktopApp/Models macos/DCFDesktopApp/Tests/DCFDesktopAppTests/ValuationContractDecodingTests.swift
git commit -m "feat: add native valuation contracts"
```

### Task 3: Build the Python engine launcher and health client

**Files:**
- Create: `macos/DCFDesktopApp/Sources/DCFDesktopApp/Services/ValuationEngineClient.swift`
- Create: `macos/DCFDesktopApp/Sources/DCFDesktopApp/Services/PythonEngineProcessManager.swift`
- Create: `macos/DCFDesktopApp/Sources/DCFDesktopApp/Services/EngineHTTPClient.swift`
- Create: `macos/DCFDesktopApp/Tests/DCFDesktopAppTests/EngineHTTPClientTests.swift`
- Create: `macos/DCFDesktopApp/Tests/DCFDesktopAppTests/PythonEngineProcessManagerTests.swift`
- Reference: `python/dcf_engine/service/app.py`

**Step 1: Write the failing tests**

Add tests that expect:
- a health probe to classify `healthy`, `starting`, and `failed`
- the process manager to build a launch configuration for the bundled engine wrapper

**Step 2: Run test to verify it fails**

Run: `cd macos/DCFDesktopApp && swift test --filter EngineHTTPClientTests --filter PythonEngineProcessManagerTests`
Expected: FAIL because the service types do not exist.

**Step 3: Write minimal implementation**

Define the `ValuationEngineClient` protocol and implement an HTTP-backed client plus a process manager that starts the local engine and waits for readiness.

**Step 4: Run test to verify it passes**

Run: `cd macos/DCFDesktopApp && swift test --filter EngineHTTPClientTests --filter PythonEngineProcessManagerTests`
Expected: PASS with no live Python process required.

**Step 5: Commit**

```bash
git add macos/DCFDesktopApp/Sources/DCFDesktopApp/Services macos/DCFDesktopApp/Tests/DCFDesktopAppTests/EngineHTTPClientTests.swift macos/DCFDesktopApp/Tests/DCFDesktopAppTests/PythonEngineProcessManagerTests.swift
git commit -m "feat: add desktop engine client and launcher"
```

### Task 4: Add local history persistence

**Files:**
- Create: `macos/DCFDesktopApp/Sources/DCFDesktopApp/Persistence/PersistedRun.swift`
- Create: `macos/DCFDesktopApp/Sources/DCFDesktopApp/Persistence/RunHistoryStore.swift`
- Create: `macos/DCFDesktopApp/Tests/DCFDesktopAppTests/RunHistoryStoreTests.swift`

**Step 1: Write the failing test**

Add a store test that:
- saves a replayable run snapshot
- fetches runs in reverse chronological order
- reloads a saved snapshot by identifier

**Step 2: Run test to verify it fails**

Run: `cd macos/DCFDesktopApp && swift test --filter RunHistoryStoreTests`
Expected: FAIL because the persistence types do not exist.

**Step 3: Write minimal implementation**

Create a SwiftData-backed local store whose records include company summary, assumptions, scenarios, histogram, sensitivity matrix, projections, and timestamps.

**Step 4: Run test to verify it passes**

Run: `cd macos/DCFDesktopApp && swift test --filter RunHistoryStoreTests`
Expected: PASS and the store can round-trip a complete replay snapshot.

**Step 5: Commit**

```bash
git add macos/DCFDesktopApp/Sources/DCFDesktopApp/Persistence macos/DCFDesktopApp/Tests/DCFDesktopAppTests/RunHistoryStoreTests.swift
git commit -m "feat: add local run history store"
```

### Task 5: Build the native shell and sidebar structure

**Files:**
- Create: `macos/DCFDesktopApp/Sources/DCFDesktopApp/Features/Shell/RootView.swift`
- Create: `macos/DCFDesktopApp/Sources/DCFDesktopApp/Features/Shell/SidebarView.swift`
- Create: `macos/DCFDesktopApp/Sources/DCFDesktopApp/Features/Shell/InspectorView.swift`
- Create: `macos/DCFDesktopApp/Sources/DCFDesktopApp/Features/Shell/ToolbarContent.swift`
- Create: `macos/DCFDesktopApp/Sources/DCFDesktopApp/Features/Shell/AppViewModel.swift`
- Create: `macos/DCFDesktopApp/Tests/DCFDesktopAppTests/AppViewModelSelectionTests.swift`

**Step 1: Write the failing test**

Add view-model tests that expect:
- company selection updates active company
- run selection updates active replay
- scenario switching updates active scenario without clearing selection

**Step 2: Run test to verify it fails**

Run: `cd macos/DCFDesktopApp && swift test --filter AppViewModelSelectionTests`
Expected: FAIL because the shell view model does not exist.

**Step 3: Write minimal implementation**

Create the `NavigationSplitView` shell, toolbar search slot, sidebar sections, and inspector container backed by a single app view model.

**Step 4: Run test to verify it passes**

Run:
- `cd macos/DCFDesktopApp && swift test --filter AppViewModelSelectionTests`
- `./script/build_and_run.sh --verify`

Expected:
- Swift test PASS
- app launches with sidebar, detail, and inspector regions

**Step 5: Commit**

```bash
git add macos/DCFDesktopApp/Sources/DCFDesktopApp/Features/Shell macos/DCFDesktopApp/Tests/DCFDesktopAppTests/AppViewModelSelectionTests.swift
git commit -m "feat: add native mac app shell layout"
```

### Task 6: Implement search and company loading

**Files:**
- Create: `macos/DCFDesktopApp/Sources/DCFDesktopApp/Features/Search/CompanySearchService.swift`
- Create: `macos/DCFDesktopApp/Sources/DCFDesktopApp/Features/Search/SearchState.swift`
- Modify: `macos/DCFDesktopApp/Sources/DCFDesktopApp/Features/Shell/AppViewModel.swift`
- Create: `macos/DCFDesktopApp/Tests/DCFDesktopAppTests/CompanySearchServiceTests.swift`

**Step 1: Write the failing test**

Add tests that expect:
- search results map from engine responses into sidebar-ready company summaries
- empty and failed search states become user-safe UI states

**Step 2: Run test to verify it fails**

Run: `cd macos/DCFDesktopApp && swift test --filter CompanySearchServiceTests`
Expected: FAIL because the search service does not exist.

**Step 3: Write minimal implementation**

Route toolbar search through the engine client, update the sidebar company section, and load company facts needed for valuation requests.

**Step 4: Run test to verify it passes**

Run: `cd macos/DCFDesktopApp && swift test --filter CompanySearchServiceTests`
Expected: PASS with mocked service responses.

**Step 5: Commit**

```bash
git add macos/DCFDesktopApp/Sources/DCFDesktopApp/Features/Search macos/DCFDesktopApp/Sources/DCFDesktopApp/Features/Shell/AppViewModel.swift macos/DCFDesktopApp/Tests/DCFDesktopAppTests/CompanySearchServiceTests.swift
git commit -m "feat: add native company search flow"
```

### Task 7: Implement valuation workflow and native workspace rendering

**Files:**
- Create: `macos/DCFDesktopApp/Sources/DCFDesktopApp/Features/Workspace/WorkspaceView.swift`
- Create: `macos/DCFDesktopApp/Sources/DCFDesktopApp/Features/Workspace/FairValueHeroView.swift`
- Create: `macos/DCFDesktopApp/Sources/DCFDesktopApp/Features/Workspace/DistributionChartView.swift`
- Create: `macos/DCFDesktopApp/Sources/DCFDesktopApp/Features/Workspace/SensitivityView.swift`
- Create: `macos/DCFDesktopApp/Sources/DCFDesktopApp/Features/Workspace/ProjectionTableView.swift`
- Create: `macos/DCFDesktopApp/Sources/DCFDesktopApp/Features/Inspector/AssumptionsInspectorView.swift`
- Modify: `macos/DCFDesktopApp/Sources/DCFDesktopApp/Features/Shell/AppViewModel.swift`
- Create: `macos/DCFDesktopApp/Tests/DCFDesktopAppTests/ValuationWorkflowTests.swift`

**Step 1: Write the failing test**

Add a workflow test that expects:
- selecting a company and computing a valuation stores the latest result in app state
- changing assumptions triggers recomputation after debounce
- scenario selection changes the visible scenario result

**Step 2: Run test to verify it fails**

Run: `cd macos/DCFDesktopApp && swift test --filter ValuationWorkflowTests`
Expected: FAIL because the compute workflow is not implemented.

**Step 3: Write minimal implementation**

Hook the app view model to the engine client, render the workspace views with native Charts/table components, and wire the inspector assumptions into a debounced compute pipeline.

**Step 4: Run test to verify it passes**

Run:
- `cd macos/DCFDesktopApp && swift test --filter ValuationWorkflowTests`
- `./script/build_and_run.sh --verify`

Expected:
- Swift test PASS
- app launches and can render a computed workspace

**Step 5: Commit**

```bash
git add macos/DCFDesktopApp/Sources/DCFDesktopApp/Features/Workspace macos/DCFDesktopApp/Sources/DCFDesktopApp/Features/Inspector macos/DCFDesktopApp/Sources/DCFDesktopApp/Features/Shell/AppViewModel.swift macos/DCFDesktopApp/Tests/DCFDesktopAppTests/ValuationWorkflowTests.swift
git commit -m "feat: add native valuation workspace"
```

### Task 8: Add replayable local history behavior

**Files:**
- Modify: `macos/DCFDesktopApp/Sources/DCFDesktopApp/Features/Shell/AppViewModel.swift`
- Modify: `macos/DCFDesktopApp/Sources/DCFDesktopApp/Features/Shell/SidebarView.swift`
- Create: `macos/DCFDesktopApp/Tests/DCFDesktopAppTests/ReplaySelectionTests.swift`

**Step 1: Write the failing test**

Add tests that expect:
- successful compute saves a local run automatically
- selecting a saved run restores the persisted snapshot without recompute
- a failed recompute does not erase the last successful visible run

**Step 2: Run test to verify it fails**

Run: `cd macos/DCFDesktopApp && swift test --filter ReplaySelectionTests`
Expected: FAIL because replay selection is not wired.

**Step 3: Write minimal implementation**

Integrate the run-history store into the app view model and sidebar so the workspace can restore persisted runs instantly.

**Step 4: Run test to verify it passes**

Run: `cd macos/DCFDesktopApp && swift test --filter ReplaySelectionTests`
Expected: PASS with mocked engine failures and persisted snapshots.

**Step 5: Commit**

```bash
git add macos/DCFDesktopApp/Sources/DCFDesktopApp/Features/Shell/AppViewModel.swift macos/DCFDesktopApp/Sources/DCFDesktopApp/Features/Shell/SidebarView.swift macos/DCFDesktopApp/Tests/DCFDesktopAppTests/ReplaySelectionTests.swift
git commit -m "feat: add local replayable run history"
```

### Task 9: Bundle the Python runtime and package the `.app`

**Files:**
- Create: `scripts/build_macos_engine_bundle.py`
- Create: `scripts/stage_macos_app_bundle.py`
- Create: `macos/DCFDesktopApp/Resources/engine/README.md`
- Modify: `script/build_and_run.sh`
- Create: `macos/DCFDesktopApp/Tests/DCFDesktopAppTests/BundleLayoutTests.swift`

**Step 1: Write the failing test**

Add a bundle-layout test that expects the staged app resources to include:
- engine wrapper
- Python runtime directory
- engine package resources path

**Step 2: Run test to verify it fails**

Run: `cd macos/DCFDesktopApp && swift test --filter BundleLayoutTests`
Expected: FAIL because the bundle resources are not staged yet.

**Step 3: Write minimal implementation**

Create scripts that build a private Python runtime bundle, copy engine resources into the app bundle, and update `build_and_run.sh` to stage and launch the full `.app`.

**Step 4: Run test to verify it passes**

Run:
- `cd macos/DCFDesktopApp && swift test --filter BundleLayoutTests`
- `./script/build_and_run.sh --verify`

Expected:
- Swift test PASS
- verify mode confirms the staged `.app` contains the engine payload and launches

**Step 5: Commit**

```bash
git add scripts/build_macos_engine_bundle.py scripts/stage_macos_app_bundle.py script/build_and_run.sh macos/DCFDesktopApp/Resources/engine macos/DCFDesktopApp/Tests/DCFDesktopAppTests/BundleLayoutTests.swift
git commit -m "feat: bundle python engine inside mac app"
```

### Task 10: Add end-to-end verification and release docs

**Files:**
- Create: `macos/DCFDesktopApp/Tests/DCFDesktopAppTests/DesktopSmokeChecklist.md`
- Create: `docs/macos-app-local-release.md`
- Modify: `README.md`
- Modify: `ASSISTANT_LOG.md`

**Step 1: Write the failing verification target**

Create a deterministic smoke checklist that covers:
- launch app
- search company
- compute valuation
- change assumptions
- quit and relaunch
- reopen a saved run

**Step 2: Run verification to expose remaining gaps**

Run:
- `cd macos/DCFDesktopApp && swift test`
- `cd python && pytest`
- `./script/build_and_run.sh --verify`

Expected: at least one gap remains before the release docs are complete.

**Step 3: Write minimal implementation**

Finish any remaining wiring needed to make the smoke checklist pass, then document the local release flow and add README guidance for the desktop app.

**Step 4: Run final verification**

Run:
- `cd macos/DCFDesktopApp && swift test`
- `cd python && pytest`
- `./script/build_and_run.sh --verify`

Expected:
- all Swift tests PASS
- Python tests PASS
- app builds and launches as a standalone `.app`

**Step 5: Commit**

```bash
git add docs/macos-app-local-release.md README.md ASSISTANT_LOG.md macos/DCFDesktopApp/Tests/DCFDesktopAppTests/DesktopSmokeChecklist.md
git commit -m "docs: add native mac app release and verification notes"
```
