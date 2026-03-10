/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import {
  getSearchShortcutLabelForPlatform,
  resolveSearchShortcutAction,
} from "../lib/utils/topBarShortcut";

describe("top bar shortcut helpers", () => {
  test("focuses inline search when the shortcut is pressed and desktop search is visible", () => {
    expect(
      resolveSearchShortcutAction({
        key: "k",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        defaultPrevented: false,
        targetIsEditable: false,
        hasVisibleDesktopSearch: true,
        isOverlayOpen: false,
      }),
    ).toBe("focus-inline");
  });

  test("opens overlay when the shortcut is pressed without visible desktop search", () => {
    expect(
      resolveSearchShortcutAction({
        key: "k",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        defaultPrevented: false,
        targetIsEditable: false,
        hasVisibleDesktopSearch: false,
        isOverlayOpen: false,
      }),
    ).toBe("open-overlay");
  });

  test("re-focuses overlay input when the overlay is already open", () => {
    expect(
      resolveSearchShortcutAction({
        key: "k",
        ctrlKey: false,
        metaKey: true,
        altKey: false,
        shiftKey: false,
        defaultPrevented: false,
        targetIsEditable: false,
        hasVisibleDesktopSearch: false,
        isOverlayOpen: true,
      }),
    ).toBe("focus-overlay");
  });

  test("ignores editable targets and incomplete modifier states", () => {
    expect(
      resolveSearchShortcutAction({
        key: "k",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        defaultPrevented: false,
        targetIsEditable: true,
        hasVisibleDesktopSearch: true,
        isOverlayOpen: false,
      }),
    ).toBeNull();

    expect(
      resolveSearchShortcutAction({
        key: "k",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        defaultPrevented: false,
        targetIsEditable: false,
        hasVisibleDesktopSearch: true,
        isOverlayOpen: false,
      }),
    ).toBeNull();
  });

  test("returns platform-aware shortcut labels", () => {
    expect(getSearchShortcutLabelForPlatform("MacIntel Mozilla/5.0")).toBe("⌘K");
    expect(getSearchShortcutLabelForPlatform("iPhone Mozilla/5.0")).toBe("⌘K");
    expect(getSearchShortcutLabelForPlatform("Win32 Mozilla/5.0")).toBe("Ctrl+K");
  });
});
