'use client';

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

interface UseDialogInteractionsOptions {
  open: boolean;
  onEscape: () => void;
  containerRef?: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  trapFocus?: boolean;
  lockScroll?: boolean;
  restoreFocus?: boolean;
  focusDelayMs?: number;
  selectOnFocus?: boolean;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

export function getFocusWrapTarget(
  activeElement: HTMLElement | null,
  focusableElements: HTMLElement[],
  shiftKey: boolean,
): HTMLElement | null {
  if (focusableElements.length === 0) {
    return null;
  }

  const first = focusableElements[0];
  const last = focusableElements[focusableElements.length - 1];

  if (shiftKey && activeElement === first) {
    return last;
  }
  if (!shiftKey && activeElement === last) {
    return first;
  }
  return null;
}

export function useDialogInteractions({
  open,
  onEscape,
  containerRef,
  initialFocusRef,
  trapFocus = false,
  lockScroll = false,
  restoreFocus = true,
  focusDelayMs = 0,
  selectOnFocus = false,
}: UseDialogInteractionsOptions): void {
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    lastFocusedRef.current = document.activeElement as HTMLElement | null;

    const previousOverflow = document.body.style.overflow;
    if (lockScroll) {
      document.body.style.overflow = 'hidden';
    }

    const focusTimer = window.setTimeout(() => {
      const container = containerRef?.current ?? null;
      const focusTarget =
        initialFocusRef?.current ??
        (container ? getFocusableElements(container)[0] ?? container : null);

      focusTarget?.focus();

      if (
        selectOnFocus &&
        (focusTarget instanceof HTMLInputElement || focusTarget instanceof HTMLTextAreaElement)
      ) {
        focusTarget.select();
      }
    }, focusDelayMs);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onEscape();
        return;
      }

      if (event.key !== 'Tab' || !trapFocus) {
        return;
      }

      const container = containerRef?.current;
      if (!container) {
        return;
      }

      const focusableElements = getFocusableElements(container);
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const activeElement = document.activeElement as HTMLElement | null;
      const wrapTarget = getFocusWrapTarget(activeElement, focusableElements, event.shiftKey);
      if (wrapTarget) {
        event.preventDefault();
        wrapTarget.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);

      if (lockScroll) {
        document.body.style.overflow = previousOverflow;
      }

      if (restoreFocus) {
        lastFocusedRef.current?.focus();
      }
    };
  }, [
    containerRef,
    focusDelayMs,
    initialFocusRef,
    lockScroll,
    onEscape,
    open,
    restoreFocus,
    selectOnFocus,
    trapFocus,
  ]);
}
