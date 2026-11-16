// Loading, error and setup messages shared by every screen.
import { useApi } from '../useApi.js';

/** Spinner + label, shown while a screen has no data yet. */
export function Loading({ label = 'Loading…' }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

/** A readable error with a retry button. */
export function ErrorNotice({ error, onRetry, title = 'Something went wrong' }) {
  if (!error) return null;

  return (
    <div className="state state-error" role="alert">
      <h2>{title}</h2>
      <p>{error.message}</p>
      {error.retryAfterSeconds ? (
        <p className="muted">The free plan allows 10 requests a minute — try again in about {error.retryAfterSeconds}s.</p>
      ) : null}
      {onRetry ? (
        <button type="button" className="button" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

/**
 * A permanent banner when the server has no API key.
 * The app still runs, so this is guidance rather than a hard error.
 */
export function MissingKeyBanner() {
  return (
    <div className="banner" role="alert">
      <strong>FOOTBALL_API_KEY is not set.</strong>
      <span>
        Copy <code>.env.example</code> to <code>.env</code>, paste your free key from
        football-data.org, then restart the server.
      </span>
    </div>
  );
}

/** Checks /api/health so the shell can warn about a missing key. */
export function useApiKeyStatus() {
  const { data, error } = useApi('/health');
  return {
    ready: Boolean(data),
    hasApiKey: data ? data.hasApiKey !== false : true, // unknown = do not nag
    serverDown: Boolean(error),
  };
}
