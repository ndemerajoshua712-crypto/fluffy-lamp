// Small data-fetching hook: loading, error and a retry function.
import { useCallback, useEffect, useState } from 'react';
import { getJson } from './api.js';

export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path) });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!path) return undefined;

    const controller = new AbortController();
    setState({ data: null, error: null, loading: true });

    getJson(path, controller.signal)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => {
        if (error.name === 'AbortError') return; // screen changed, ignore
        setState({ data: null, error, loading: false });
      });

    return () => controller.abort();
  }, [path, attempt]);

  // Retry: bumping the attempt re-runs the effect.
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { ...state, reload };
}
