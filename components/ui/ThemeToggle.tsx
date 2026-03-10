'use client';

import { MoonIcon, SunIcon } from '@radix-ui/react-icons';
import { useTheme } from '@/lib/contexts/ThemeContext';
import styles from './ThemeToggle.module.css';

interface ThemeToggleProps {
  /** Additional CSS classes */
  className?: string;
}

/**
 * Sun/moon toggle button for switching between dark and light themes.
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className={`${styles.toggle} ${className || ''}`}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    >
      {theme === 'dark' ? (
        <SunIcon width={18} height={18} aria-hidden="true" />
      ) : (
        <MoonIcon width={18} height={18} aria-hidden="true" />
      )}
    </button>
  );
}
