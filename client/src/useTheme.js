// Light and dark mode.
// The default follows the operating system; the toggle stores a preference
// that wins over it (see the inline script in index.html for the first paint).
import { useCallback, useEffect, useState } from 'react';

function currentTheme() {
  const set = document.documentElement.dataset.theme;
  if (set === 'light' || set === 'dark') return set;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState(currentTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('theme', next);
      } catch {
        /* private mode: the choice just is not remembered */
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
