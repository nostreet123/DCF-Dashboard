import assert from "node:assert/strict";
import { describe, test } from "bun:test";
import {
  createInitialWorkbenchState,
  workbenchReducer,
  type WorkbenchState,
} from "../lib/contexts/WorkbenchContext";

describe("WorkbenchContext reducer", () => {
  test("updates assumptions for active scenario only", () => {
    let state = createInitialWorkbenchState();

    state = workbenchReducer(state, { type: "set_scenario", scenario: "bull" });
    state = workbenchReducer(state, {
      type: "update_assumption",
      key: "revenueGrowth",
      value: 21,
    });

    assert.equal(state.scenario, "bull");
    assert.equal(state.assumptions.bull.revenueGrowth, 21);
    assert.equal(state.assumptions.base.revenueGrowth, 12);
    assert.equal(state.assumptions.bear.revenueGrowth, 6);
  });

  test("select_company sets symbol/id and clears selected run", () => {
    const seed: WorkbenchState = {
      ...createInitialWorkbenchState(),
      selectedRunId: "run-1",
    };

    const state = workbenchReducer(seed, {
      type: "select_company",
      id: "2",
      symbol: "MSFT",
    });

    assert.equal(state.selectedCompanyId, "2");
    assert.equal(state.selectedSymbol, "MSFT");
    assert.equal(state.selectedRunId, null);
  });

  test("reset returns a clean state snapshot", () => {
    let state = createInitialWorkbenchState();
    state = workbenchReducer(state, {
      type: "update_assumption",
      key: "discountRate",
      value: 11,
    });

    const reset = workbenchReducer(state, { type: "reset" });

    assert.equal(reset.assumptions.base.discountRate, 10);
    assert.equal(reset.selectedCompanyId, null);
    assert.equal(reset.isComputing, false);
  });
});
