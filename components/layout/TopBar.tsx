'use client';

import {
  HamburgerMenuIcon,
  MagnifyingGlassIcon,
  MixerHorizontalIcon,
} from '@radix-ui/react-icons';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { ModeToggle } from '@/components/ui/ModeToggle';
import { SearchOverlay } from '@/components/ui/SearchOverlay';
import { Sparkline } from '@/components/charts/Sparkline';
import { getCompanyLogoUrl } from '@/lib/companyLogos';
import {
  formatCoverageState,
  getCompanyCoverageState,
  getCompanyListingLabel,
  getCompanyMarketLabel,
  getCompanySearchSymbol,
  type CompanySearchResult,
} from '@/lib/companySearch';
import {
  getSearchShortcutLabelForPlatform,
  resolveSearchShortcutAction,
} from '@/lib/utils/topBarShortcut';
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
  /** Search preview callback for the dropdown. */
  onSearchPreview?: (query: string) => void;
  /** Current search suggestions. */
  searchResults?: CompanySearchResult[];
  /** Whether search suggestions are loading. */
  isSearching?: boolean;
  /** Search result selection callback. */
  onSelectSearchResult?: (result: CompanySearchResult) => void;
  /** Opens left mobile drawer */
  onOpenLibrary?: () => void;
  /** Opens right mobile drawer */
  onOpenAssumptions?: () => void;
  /** Disables the global search shortcut while another modal owns focus */
  disableSearchShortcut?: boolean;
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
  onSearchPreview,
  searchResults = [],
  isSearching = false,
  onSelectSearchResult,
  onOpenLibrary,
  onOpenAssumptions,
  disableSearchShortcut = false,
}: TopBarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOverlayOpen, setIsSearchOverlayOpen] = useState(false);
  const [isDesktopResultsOpen, setIsDesktopResultsOpen] = useState(false);
  const desktopSearchRef = useRef<HTMLInputElement>(null);
  const overlaySearchRef = useRef<HTMLInputElement>(null);
  const shortcutLabel = getSearchShortcutLabel();

  const submitSearch = (query = searchQuery) => {
    onSearch?.(query);
    setIsDesktopResultsOpen(false);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!(form instanceof HTMLFormElement)) {
      submitSearch();
      return;
    }
    const formData = new FormData(form);
    const submittedQuery = formData.get('company-search');
    submitSearch(typeof submittedQuery === 'string' ? submittedQuery : searchQuery);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (disableSearchShortcut) {
        return;
      }

      const desktopSearch = desktopSearchRef.current;
      const action = resolveSearchShortcutAction({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        defaultPrevented: event.defaultPrevented,
        targetIsEditable: isEditableTarget(event.target),
        hasVisibleDesktopSearch: Boolean(desktopSearch && desktopSearch.offsetParent !== null),
        isOverlayOpen: isSearchOverlayOpen,
      });

      if (!action) {
        return;
      }

      event.preventDefault();

      if (action === 'focus-inline') {
        focusAndSelect(desktopSearch);
        return;
      }

      if (action === 'focus-overlay') {
        focusAndSelect(overlaySearchRef.current);
        return;
      }

      setIsSearchOverlayOpen(true);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [disableSearchShortcut, isSearchOverlayOpen]);

  useEffect(() => {
    if (!onSearchPreview || searchQuery.trim().length < 2) {
      return;
    }
    const timeout = window.setTimeout(() => {
      onSearchPreview(searchQuery);
      setIsDesktopResultsOpen(true);
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [onSearchPreview, searchQuery]);

  const handleSelectResult = (result: CompanySearchResult) => {
    const symbol = getCompanySearchSymbol(result);
    if (symbol) {
      setSearchQuery(symbol);
    }
    setIsDesktopResultsOpen(false);
    setIsSearchOverlayOpen(false);
    onSelectSearchResult?.(result);
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
            <HamburgerMenuIcon width={18} height={18} aria-hidden="true" />
          </button>

          <div className={styles.logo}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="7" height="7" rx="1" fill="var(--accent-gold)" />
              <rect x="14" y="3" width="7" height="7" rx="1" fill="currentColor" opacity="0.55" />
              <rect x="3" y="14" width="7" height="7" rx="1" fill="currentColor" opacity="0.35" />
              <rect x="14" y="14" width="7" height="7" rx="1" fill="var(--accent-gold)" opacity="0.86" />
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
            <MagnifyingGlassIcon
              className={styles.searchIcon}
              width={16}
              height={16}
              aria-hidden="true"
            />
            <input
              ref={desktopSearchRef}
              type="text"
              name="company-search"
              aria-label="Search companies"
              autoComplete="off"
              placeholder="Search companies..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsDesktopResultsOpen(true);
              }}
              onFocus={() => {
                if (searchQuery.trim().length >= 2) {
                  setIsDesktopResultsOpen(true);
                }
              }}
              className={styles.searchInput}
            />
            <kbd className={styles.searchKbd} suppressHydrationWarning>
              {shortcutLabel}
            </kbd>
            <button
              type="submit"
              className={styles.searchSubmit}
              aria-label="Search companies"
            >
              <MagnifyingGlassIcon width={15} height={15} aria-hidden="true" />
            </button>
            {isDesktopResultsOpen && searchQuery.trim().length >= 2 && (
              <SearchResultsPanel
                results={searchResults}
                isLoading={isSearching}
                onSelect={handleSelectResult}
              />
            )}
          </form>
        </div>

        <div className={styles.right}>
          <button
            type="button"
            className={`${styles.mobileIconBtn} ${styles.searchTrigger}`}
            onClick={() => setIsSearchOverlayOpen(true)}
            aria-label="Open search"
          >
            <MagnifyingGlassIcon width={18} height={18} aria-hidden="true" />
          </button>

          <ModeToggle
            value="workbench"
            className={styles.modeToggle}
            labels={{ workbench: 'Workbench', investor: 'Investor' }}
            disabledModes={{ investor: true }}
            statusLabels={{ investor: 'Soon' }}
          />

          <button
            type="button"
            className={`${styles.mobileIconBtn} ${styles.assumptionsTrigger}`}
            onClick={onOpenAssumptions}
            aria-label="Open assumptions panel"
          >
            <MixerHorizontalIcon width={18} height={18} aria-hidden="true" />
          </button>

          <ThemeToggle className={styles.themeToggle} />
        </div>
      </header>

      <SearchOverlay
        open={isSearchOverlayOpen}
        value={searchQuery}
        onChange={(value) => {
          setSearchQuery(value);
          onSearchPreview?.(value);
        }}
        onSubmit={submitSearch}
        onClose={() => setIsSearchOverlayOpen(false)}
        inputRef={overlaySearchRef}
      />
    </>
  );
}

function SearchResultsPanel({
  results,
  isLoading,
  onSelect,
}: {
  results: CompanySearchResult[];
  isLoading: boolean;
  onSelect: (result: CompanySearchResult) => void;
}) {
  return (
    <div className={styles.searchResults} role="listbox" aria-label="Company search results">
      {isLoading ? (
        <div className={styles.searchResultsEmpty}>Searching...</div>
      ) : results.length === 0 ? (
        <div className={styles.searchResultsEmpty}>No matching companies</div>
      ) : (
        results.map((result) => {
          const symbol = getCompanySearchSymbol(result) ?? 'UNKNOWN';
          const coverage = getCompanyCoverageState(result);
          const listingLabel = getCompanyListingLabel(result);
          const marketLabel = getCompanyMarketLabel(result);
          return (
            <button
              type="button"
              key={`${listingLabel ?? symbol}-${result.name ?? ''}`}
              className={styles.searchResult}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(result)}
              role="option"
              aria-selected="false"
            >
              <span className={styles.searchResultIdentity}>
                <SearchResultLogo result={result} symbol={symbol} />
              </span>
              <span className={styles.searchResultBody}>
                <span className={styles.searchResultName}>{result.name ?? 'Unknown company'}</span>
                <span className={styles.searchResultMeta}>
                  {[marketLabel, listingLabel, formatCoverageState(coverage)]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <span className={styles.searchResultSymbol}>{symbol}</span>
            </button>
          );
        })
      )}
    </div>
  );
}

function focusAndSelect(input: HTMLInputElement | null) {
  if (!input) {
    return;
  }

  input.focus();
  input.select();
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select'
  );
}

function getSearchShortcutLabel(): string {
  if (typeof navigator === 'undefined') {
    return 'Ctrl+K';
  }

  return getSearchShortcutLabelForPlatform(`${navigator.platform} ${navigator.userAgent}`);
}

function SearchResultLogo({
  result,
  symbol,
}: {
  result: CompanySearchResult;
  symbol: string;
}) {
  const [hasLogo, setHasLogo] = useState(true);
  const logoUrl = result.logoUrl ?? getCompanyLogoUrl(symbol);
  const fallbackText = symbol.slice(0, 2).toUpperCase();

  if (!logoUrl || !hasLogo) {
    return (
      <span className={styles.searchResultLogoFallback} aria-hidden="true">
        {fallbackText}
      </span>
    );
  }

  return (
    <Image
      className={styles.searchResultLogo}
      src={logoUrl}
      alt={`${symbol} logo`}
      width={28}
      height={28}
      loading="eager"
      referrerPolicy="no-referrer"
      onError={() => setHasLogo(false)}
    />
  );
}
