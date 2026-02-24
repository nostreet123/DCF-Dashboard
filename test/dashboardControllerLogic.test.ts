/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import {
  applyAssumptionChange,
  clearComputeTimeout,
} from "../lib/hooks/dashboardControllerTiming";

type AssumptionKey = "revenueGrowth" | "operatingMargin" | "discountRate" | "terminalGrowth";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("dashboard controller timing helpers", () => {
  test("applyAssumptionChange sets computing and settles after debounce", async () => {
    const timeoutRef = { current: null as ReturnType<typeof setTimeout> | null };
    const computingStates: boolean[] = [];
    const assumptionUpdates: Array<{ key: AssumptionKey; value: number }> = [];

    applyAssumptionChange<AssumptionKey>(timeoutRef, {
      key: "revenueGrowth",
      value: 14,
      settleDelayMs: 20,
      setIsComputing: (value) => computingStates.push(value),
      updateAssumption: (key, value) => assumptionUpdates.push({ key, value }),
    });

    expect(computingStates).toEqual([true]);
    expect(assumptionUpdates).toEqual([{ key: "revenueGrowth", value: 14 }]);
    expect(timeoutRef.current).not.toBeNull();

    await delay(30);
    expect(computingStates).toEqual([true, false]);
    expect(timeoutRef.current).toBeNull();
  });

  test("applyAssumptionChange supersedes prior settle timer", async () => {
    const timeoutRef = { current: null as ReturnType<typeof setTimeout> | null };
    const computingStates: boolean[] = [];

    const setIsComputing = (value: boolean) => {
      computingStates.push(value);
    };

    const updateAssumption = () => {};

    applyAssumptionChange<AssumptionKey>(timeoutRef, {
      key: "discountRate",
      value: 10,
      settleDelayMs: 35,
      setIsComputing,
      updateAssumption,
    });
    await delay(10);
    applyAssumptionChange<AssumptionKey>(timeoutRef, {
      key: "discountRate",
      value: 9.5,
      settleDelayMs: 35,
      setIsComputing,
      updateAssumption,
    });

    await delay(50);
    expect(computingStates.filter((value) => value === true).length).toBe(2);
    expect(computingStates.filter((value) => value === false).length).toBe(1);
  });

  test("clearComputeTimeout cancels pending settle", async () => {
    const timeoutRef = { current: null as ReturnType<typeof setTimeout> | null };
    const computingStates: boolean[] = [];

    applyAssumptionChange<AssumptionKey>(timeoutRef, {
      key: "terminalGrowth",
      value: 3,
      settleDelayMs: 30,
      setIsComputing: (value) => computingStates.push(value),
      updateAssumption: () => {},
    });
    clearComputeTimeout(timeoutRef);

    await delay(40);
    expect(computingStates).toEqual([true]);
    expect(timeoutRef.current).toBeNull();
  });
});
