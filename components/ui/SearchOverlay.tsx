'use client';

import { useRef, type MutableRefObject } from 'react';
import { useDialogInteractions } from '@/lib/hooks/useDialogInteractions';
import styles from './SearchOverlay.module.css';

interface SearchOverlayProps {
  open: boolean;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  inputRef?: MutableRefObject<HTMLInputElement | null>;
}

export function SearchOverlay({
  open,
  value,
  onChange,
  onSubmit,
  onClose,
  inputRef,
}: SearchOverlayProps) {
  const localInputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLFormElement | null>(null);
  const resolvedInputRef = inputRef ?? localInputRef;
  const setInputRef = (node: HTMLInputElement | null) => {
    localInputRef.current = node;
    if (inputRef) {
      inputRef.current = node;
    }
  };

  useDialogInteractions({
    open,
    onEscape: onClose,
    containerRef: dialogRef,
    initialFocusRef: resolvedInputRef,
    trapFocus: true,
    lockScroll: true,
    focusDelayMs: 10,
    selectOnFocus: true,
  });

  if (!open) {
    return null;
  }

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <form
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Search companies"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
          onClose();
        }}
      >
        <label className={styles.label} htmlFor="mobile-search-input">
          Search companies
        </label>
        <input
          id="mobile-search-input"
          ref={setInputRef}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={styles.input}
          placeholder="AAPL, Microsoft, semiconductor..."
        />
        <div className={styles.actions}>
          <button type="button" className={styles.ghost} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={styles.submit}>
            Search
          </button>
        </div>
      </form>
    </div>
  );
}
