'use client';

import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
type ThemeToggleVariant = 'customer' | 'console';

const KEY = 'movescan-theme';

function current(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => setThemeState(current()), []);

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Private browsing may not permit persistent storage.
    }
    setThemeState(next);
  }, []);

  const toggle = useCallback(() => {
    setTheme(current() === 'dark' ? 'light' : 'dark');
  }, [setTheme]);

  return { theme, setTheme, toggle };
}

function ThemeIcon({ theme }: { theme: Theme }) {
  return theme === 'dark' ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4" aria-hidden="true">
      <path d="M20.8 15.2A8.5 8.5 0 0 1 8.8 3.2 8.5 8.5 0 1 0 20.8 15.2Z" />
    </svg>
  );
}

export function ThemeToggle({ variant = 'console' }: { variant?: ThemeToggleVariant }) {
  const { theme, toggle } = useTheme();
  const colors = variant === 'customer'
    ? 'border-u-border bg-u-panel text-u-ink-2 hover:border-c-accent hover:text-c-accent'
    : 'border-c-border text-c-ink-2 hover:border-c-border-hi hover:text-c-ink';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      className={`grid size-9 place-items-center rounded-lg border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-c-accent ${colors}`}
    >
      <ThemeIcon theme={theme} />
    </button>
  );
}
