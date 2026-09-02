'use client';

import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'movescan-theme';

function current(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('dark');

  // The pre-paint script already set the attribute; adopt it rather than re-deciding.
  useEffect(() => setThemeState(current()), []);

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch { /* private mode: session-only */ }
    setThemeState(next);
  }, []);

  const toggle = useCallback(() => {
    setTheme(current() === 'dark' ? 'light' : 'dark');
  }, [setTheme]);

  return { theme, setTheme, toggle };
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      className="ml-auto grid size-9 place-items-center rounded-lg border border-c-border text-c-ink-2 transition hover:border-c-border-hi hover:text-c-ink"
    >
      <span aria-hidden className="text-sm">{theme === 'dark' ? '☀' : '☾'}</span>
    </button>
  );
}
