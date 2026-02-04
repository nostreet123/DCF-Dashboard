'use client';

import styles from './Pagination.module.css';

interface PaginationProps {
  /** Current page (1-indexed) */
  currentPage: number;
  /** Total number of pages */
  totalPages: number;
  /** Page change handler */
  onPageChange: (page: number) => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Page navigation with Previous/Next buttons and page numbers.
 */
export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  className,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = getVisiblePages(currentPage, totalPages);

  return (
    <nav className={`${styles.container} ${className || ''}`} aria-label="Pagination">
      <button
        className={styles.button}
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        aria-label="Previous page"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M10 12L6 8L10 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>Previous</span>
      </button>

      <div className={styles.pages}>
        {pages.map((page, i) =>
          page === '...' ? (
            <span key={`ellipsis-${i}`} className={styles.ellipsis}>
              ...
            </span>
          ) : (
            <button
              key={page}
              className={`${styles.page} ${page === currentPage ? styles.active : ''}`}
              onClick={() => onPageChange(page as number)}
              aria-current={page === currentPage ? 'page' : undefined}
            >
              {page}
            </button>
          )
        )}
      </div>

      <button
        className={styles.button}
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        aria-label="Next page"
      >
        <span>Next</span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M6 4L10 8L6 12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </nav>
  );
}

/**
 * Calculate which page numbers to show.
 * Shows first, last, current, and neighbors with ellipsis for gaps.
 */
function getVisiblePages(current: number, total: number): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | '...')[] = [];

  // Always show first page
  pages.push(1);

  if (current > 3) {
    pages.push('...');
  }

  // Show pages around current
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    if (!pages.includes(i)) {
      pages.push(i);
    }
  }

  if (current < total - 2) {
    pages.push('...');
  }

  // Always show last page
  if (!pages.includes(total)) {
    pages.push(total);
  }

  return pages;
}
