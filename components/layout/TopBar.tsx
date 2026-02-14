'use client';

import { useState } from 'react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { ModeToggle } from '@/components/ui/ModeToggle';
import { SearchOverlay } from '@/components/ui/SearchOverlay';
import { Sparkline } from '@/components/charts/Sparkline';
import styles from './TopBar.module.css';

interface TopBarProps {
  /** Currently selected ticker symbol */
  ticker?: string;
  /** Stock price history for sparkline */
  priceHistory?: number[];
  /** Current stock price */
  currentPrice?: number;
  /** Search callback */
  onSearch?: (query: string) => void;
  /** Mode change callback */
  onModeChange?: (mode: 'workbench' | 'investor') => void;
  /** Current mode */
  mode?: 'workbench' | 'investor';
  /** Opens left mobile drawer */
  onOpenLibrary?: () => void;
  /** Opens right mobile drawer */
  onOpenAssumptions?: () => void;
}

/**
 * Fixed top navigation bar.
 * Contains logo, ticker pill with sparkline, search, and mode/theme toggles.
 */
export function TopBar({
  ticker,
  priceHistory,
  currentPrice,
  onSearch,
  onModeChange,
  mode = 'workbench',
  onOpenLibrary,
  onOpenAssumptions,
}: TopBarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOverlayOpen, setIsSearchOverlayOpen] = useState(false);

  const submitSearch = () => {
    onSearch?.(searchQuery);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitSearch();
  };

  return (
    <>
      <header className={styles.topbar}>
        <div className={styles.left}>
          <button
            type="button"
            className={`${styles.mobileIconBtn} ${styles.libraryTrigger}`}
            onClick={onOpenLibrary}
            aria-label="Open library panel"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M3 4H15M3 9H15M3 14H15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>

          <div className={styles.logo}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="7" height="7" rx="1" fill="var(--accent-gold)" />
              <rect x="14" y="3" width="7" height="7" rx="1" fill="var(--accent-teal)" opacity="0.6" />
              <rect x="3" y="14" width="7" height="7" rx="1" fill="var(--accent-teal)" opacity="0.6" />
              <rect x="14" y="14" width="7" height="7" rx="1" fill="var(--accent-gold)" />
            </svg>
            <span className={styles.logoText}>DCF Lab</span>
          </div>

          {ticker && (
            <div className={styles.tickerPill}>
              <span className={styles.tickerSymbol}>{ticker}</span>
              {priceHistory && priceHistory.length > 0 && (
                <Sparkline
                  data={priceHistory}
                  width={48}
                  height={20}
                  strokeWidth={1.5}
                />
              )}
              {currentPrice !== undefined && (
                <span className={styles.tickerPrice}>${currentPrice.toFixed(2)}</span>
              )}
            </div>
          )}
        </div>

        <div className={styles.center}>
          <form onSubmit={handleSearchSubmit} className={styles.searchForm}>
            <svg
              className={styles.searchIcon}
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
            >
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              placeholder="Search companies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
            <kbd className={styles.searchKbd}>⌘K</kbd>
          </form>
        </div>

        <div className={styles.right}>
          <button
            type="button"
            className={`${styles.mobileIconBtn} ${styles.searchTrigger}`}
            onClick={() => setIsSearchOverlayOpen(true)}
            aria-label="Open search"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M12 12L15 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>

          <ModeToggle
            value={mode}
            onChange={(m) => onModeChange?.(m)}
            className={styles.modeToggle}
            labels={{ workbench: 'Workbench', investor: 'Investor' }}
          />

          <button
            type="button"
            className={`${styles.mobileIconBtn} ${styles.assumptionsTrigger}`}
            onClick={onOpenAssumptions}
            aria-label="Open assumptions panel"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <line x1="4" y1="4" x2="14" y2="4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="4" y1="9" x2="14" y2="9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="4" y1="14" x2="14" y2="14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <circle cx="7" cy="4" r="1.4" fill="var(--accent-gold)" />
              <circle cx="11" cy="9" r="1.4" fill="var(--accent-gold)" />
              <circle cx="8" cy="14" r="1.4" fill="var(--accent-gold)" />
            </svg>
          </button>

          <ThemeToggle className={styles.themeToggle} />
        </div>
      </header>

      <SearchOverlay
        open={isSearchOverlayOpen}
        value={searchQuery}
        onChange={setSearchQuery}
        onSubmit={submitSearch}
        onClose={() => setIsSearchOverlayOpen(false)}
      />
    </>
  );
}
