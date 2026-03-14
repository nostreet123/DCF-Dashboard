'use client';

import { Cross2Icon } from '@radix-ui/react-icons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDialogInteractions } from '@/lib/hooks/useDialogInteractions';
import styles from './Drawer.module.css';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  side?: 'left' | 'right';
  children: ReactNode;
}

export function Drawer({
  open,
  onClose,
  title,
  side = 'left',
  children,
}: DrawerProps) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useDialogInteractions({
    open,
    onEscape: onClose,
    containerRef: panelRef,
    trapFocus: true,
    lockScroll: true,
  });

  if (!mounted || !open) {
    return null;
  }

  return createPortal(
    <div
      className={styles.overlay}
      onClick={onClose}
      role="presentation"
    >
      <aside
        ref={panelRef}
        className={`${styles.panel} ${side === 'right' ? styles.right : styles.left}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button
            type="button"
            className={styles.close}
            aria-label={`Close ${title}`}
            onClick={onClose}
          >
            <Cross2Icon width={16} height={16} aria-hidden="true" />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
      </aside>
    </div>,
    document.body
  );
}
