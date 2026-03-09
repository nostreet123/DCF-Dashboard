export type SearchShortcutAction = 'focus-inline' | 'open-overlay' | 'focus-overlay';

interface SearchShortcutInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  defaultPrevented: boolean;
  targetIsEditable: boolean;
  hasVisibleDesktopSearch: boolean;
  isOverlayOpen: boolean;
}

export function resolveSearchShortcutAction({
  key,
  ctrlKey,
  metaKey,
  altKey,
  shiftKey,
  defaultPrevented,
  targetIsEditable,
  hasVisibleDesktopSearch,
  isOverlayOpen,
}: SearchShortcutInput): SearchShortcutAction | null {
  if (defaultPrevented || altKey || shiftKey) {
    return null;
  }

  const pressedShortcut = (metaKey || ctrlKey) && key.toLowerCase() === 'k';
  if (!pressedShortcut || targetIsEditable) {
    return null;
  }

  if (hasVisibleDesktopSearch) {
    return 'focus-inline';
  }

  if (isOverlayOpen) {
    return 'focus-overlay';
  }

  return 'open-overlay';
}

export function getSearchShortcutLabelForPlatform(platformInfo: string): string {
  return /(mac|iphone|ipad|ipod)/i.test(platformInfo) ? '⌘K' : 'Ctrl+K';
}
