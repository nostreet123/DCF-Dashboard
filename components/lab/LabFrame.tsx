import type { ReactNode } from 'react';
import Link from 'next/link';

import { HistoryIcon, LibraryIcon, MemoIcon, SearchIcon } from '@/components/lab/icons';
import { LAB_PATHS, type LabScreen } from '@/lib/lab/presentation';
import { cn } from '@/lib/utils/cn';
import styles from './frame.module.css';

const NAV: Array<{ id: LabScreen; href: string; label: string; icon: typeof MemoIcon }> = [
  { id: 'memo', href: LAB_PATHS.memo, label: 'Memo', icon: MemoIcon },
  { id: 'library', href: LAB_PATHS.library, label: 'Library', icon: LibraryIcon },
  { id: 'history', href: LAB_PATHS.history, label: 'History', icon: HistoryIcon },
];

export function LabFrame({
  active,
  showCompanySearch = false,
  tone = 'paper',
  children,
}: {
  active: LabScreen;
  showCompanySearch?: boolean;
  tone?: 'paper' | 'status';
  children: ReactNode;
}) {
  return (
    <div className={cn(styles.shell, tone === 'status' && styles.shellStatus)}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href={LAB_PATHS.memo} className={styles.brand}>
            DCF Lab
          </Link>
          <nav className={styles.nav} aria-label="Primary">
            {NAV.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className={styles.navLink}
                aria-current={item.id === active ? 'page' : undefined}
              >
                {item.id === 'history' ? 'Run history' : item.label}
              </Link>
            ))}
          </nav>
          {showCompanySearch ? (
            <Link href={LAB_PATHS.library} className={styles.searchButton}>
              <SearchIcon />
              <span className={styles.searchLabel}>Value another company</span>
            </Link>
          ) : null}
        </div>
      </header>
      <main className={styles.main}>{children}</main>
      <nav className={styles.bottomNav} aria-label="Primary">
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              className={styles.bottomLink}
              aria-current={item.id === active ? 'page' : undefined}
            >
              <Icon />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
