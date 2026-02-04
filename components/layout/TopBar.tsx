'use client';

import { useState } from 'react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { ModeToggle } from '@/components/ui/ModeToggle';
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
}: TopBarProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch?.(searchQuery);
  };

  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        {/* Logo */}
        <div className={styles.logo}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="7" height="7" rx="1" fill="var(--accent-gold)" />
            <rect x="14" y="3" width="7" height="7" rx="1" fill="var(--accent-teal)" opacity="0.6" />
            <rect x="3" y="14" width="7" height="7" rx="1" fill="var(--accent-teal)" opacity="0.6" />
            <rect x="14" y="14" width="7" height="7" rx="1" fill="var(--accent-gold)" />
          </svg>
          <span className={styles.logoText}>DCF Lab</span>
        </div>

        {/* Ticker Pill */}
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
        {/* Search */}
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
        <ModeToggle
          value={mode}
          onChange={(m) => onModeChange?.(m)}
        />
        <ThemeToggle />
      </div>
    </header>
  );
}
