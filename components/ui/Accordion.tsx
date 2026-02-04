'use client';

import { useState, ReactNode } from 'react';
import styles from './Accordion.module.css';

interface AccordionItemProps {
  /** Header/title content */
  title: ReactNode;
  /** Expandable content */
  children: ReactNode;
  /** Initially expanded state */
  defaultOpen?: boolean;
  /** Badge/count to show in header */
  badge?: number | string;
}

/**
 * Individual accordion item with expandable content.
 */
export function AccordionItem({
  title,
  children,
  defaultOpen = false,
  badge,
}: AccordionItemProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={styles.item}>
      <button
        className={styles.trigger}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className={styles.title}>{title}</span>
        <div className={styles.right}>
          {badge !== undefined && (
            <span className={styles.badge}>{badge}</span>
          )}
          <svg
            className={`${styles.chevron} ${isOpen ? styles.open : ''}`}
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
          >
            <path
              d="M4 6L8 10L12 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </button>
      {isOpen && <div className={styles.content}>{children}</div>}
    </div>
  );
}

interface AccordionProps {
  /** Accordion items */
  children: ReactNode;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Container for accordion items.
 * Used for the dataset library in the left rail.
 */
export function Accordion({ children, className }: AccordionProps) {
  return <div className={`${styles.container} ${className || ''}`}>{children}</div>;
}
