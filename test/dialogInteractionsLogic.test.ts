/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { getFocusWrapTarget } from "../lib/hooks/useDialogInteractions";

describe("dialog interaction focus wrap helper", () => {
  test("wraps shift+tab from first element to last", () => {
    const first = { id: "first" } as unknown as HTMLElement;
    const middle = { id: "middle" } as unknown as HTMLElement;
    const last = { id: "last" } as unknown as HTMLElement;

    const target = getFocusWrapTarget(first, [first, middle, last], true);
    expect(target).toBe(last);
  });

  test("wraps tab from last element to first", () => {
    const first = { id: "first" } as unknown as HTMLElement;
    const last = { id: "last" } as unknown as HTMLElement;

    const target = getFocusWrapTarget(last, [first, last], false);
    expect(target).toBe(first);
  });

  test("does not wrap when active element is not a boundary element", () => {
    const first = { id: "first" } as unknown as HTMLElement;
    const middle = { id: "middle" } as unknown as HTMLElement;
    const last = { id: "last" } as unknown as HTMLElement;

    const target = getFocusWrapTarget(middle, [first, middle, last], false);
    expect(target).toBeNull();
  });

  test("returns null when there are no focusable elements", () => {
    const target = getFocusWrapTarget(null, [], false);
    expect(target).toBeNull();
  });
});
