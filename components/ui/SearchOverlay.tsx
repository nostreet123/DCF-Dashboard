'use client';

import { useRef } from 'react';
import { useDialogInteractions } from '@/lib/hooks/useDialogInteractions';
import styles from './SearchOverlay.module.css';

interface SearchOverlayProps {
  open: boolean;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

export function SearchOverlay({
  open,
  value,
  onChange,
  onSubmit,
  onClose,
}: SearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useDialogInteractions({
    open,
    onEscape: onClose,
    initialFocusRef: inputRef,
    focusDelayMs: 10,
    selectOnFocus: true,
    restoreFocus: false,
  });

  if (!open) {
    return null;
  }

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <form
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
          ref={inputRef}
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
