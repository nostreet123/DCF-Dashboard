/// <reference types="bun-types" />
import assert from "node:assert/strict";
import { describe, test } from "bun:test";
import {
  initialWorkbenchViewState,
  resolveActiveCompany,
  workbenchViewReducer,
  type DatasetGroups,
} from "../lib/hooks/useWorkbenchViewState";

const datasets: DatasetGroups = {
  Technology: [
    { id: "1", name: "Apple Inc.", ticker: "AAPL" },
    { id: "2", name: "Microsoft Corp.", ticker: "MSFT" },
  ],
  Finance: [{ id: "3", name: "JPMorgan Chase", ticker: "JPM" }],
};

describe("dashboard view state", () => {
  test("opens and closes drawers", () => {
    let state = initialWorkbenchViewState;

    state = workbenchViewReducer(state, { type: "open_library_drawer" });
    assert.equal(state.activeDrawer, "library");

    state = workbenchViewReducer(state, { type: "open_assumptions_drawer" });
    assert.equal(state.activeDrawer, "assumptions");

    state = workbenchViewReducer(state, { type: "close_drawers" });
    assert.equal(state.activeDrawer, null);
  });

  test("drawer company selection closes drawer while docked selection does not", () => {
    const openLibrary = workbenchViewReducer(initialWorkbenchViewState, {
      type: "open_library_drawer",
    });

    const afterDockedSelection = workbenchViewReducer(openLibrary, {
      type: "select_company",
      source: "docked",
    });
    assert.equal(afterDockedSelection.activeDrawer, "library");

    const afterDrawerSelection = workbenchViewReducer(openLibrary, {
      type: "select_company",
      source: "drawer",
    });
    assert.equal(afterDrawerSelection.activeDrawer, null);
  });

  test("resolveActiveCompany uses selected id and falls back to first company", () => {
    const selected = resolveActiveCompany(datasets, "2");
    assert.equal(selected?.ticker, "MSFT");

    const missing = resolveActiveCompany(datasets, "999");
    assert.equal(missing?.ticker, "AAPL");

    const empty = resolveActiveCompany({}, "1");
    assert.equal(empty, null);
  });
});
