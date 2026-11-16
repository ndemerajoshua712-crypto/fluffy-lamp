// Talks to football-data.org and caches every response in SQLite.
//
// Free plan rules we respect:
//   - 10 requests per minute, so a small in-process limiter stops us before
//     the API has to reject us. If we still get a 429 it becomes a clear error.
//   - Responses are reused for 10 minutes, which keeps the request count low.
import { readCache, writeCache } from './cache.js';

const BASE_URL = 'https://api.football-data.org/v4';
const RATE_LIMIT_MAX = 10; // free plan: 10 requests...
const RATE_LIMIT_WINDOW_MS = 60_000; // ...per minute

/** An error we can safely show to the user. */
export class ApiError extends Error {
  constructor(message, { status = 500, code = 'api_error', retryAfterMs = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Counts requests in a sliding window. `take()` either reserves a slot or
 * says how long to wait, so we never go over the free plan's allowance.
 */
export function createRateLimiter({
  max = RATE_LIMIT_MAX,
  windowMs = RATE_LIMIT_WINDOW_MS,
  now = Date.now,
} = {}) {
  let timestamps = [];

  return {
    take() {
      const t = now();
      timestamps = timestamps.filter((s) => t - s < windowMs); // drop old ones
      if (timestamps.length >= max) {
        return { ok: false, retryAfterMs: windowMs - (t - timestamps[0]) };
      }
      timestamps.push(t);
      return { ok: true };
    },
    // Only used by tests.
    reset() {
      timestamps = [];
    },
  };
}

/**
 * Create the API client. `db` is the SQLite handle, `fetchImpl` and `now` are
 * injectable so the tests can run without a network or a real clock.
 */
export function createFootballApi({
  apiKey,
  db,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  limiter = createRateLimiter({ now }),
} = {}) {
  /** GET a path like '/competitions/PL/standings'. Returns { data, cached }. */
  async function get(path) {
    if (!apiKey) {
      throw new ApiError(
        'The football API key is missing. Add FOOTBALL_API_KEY to your .env file and restart the server.',
        { status: 503, code: 'missing_api_key' }
      );
    }

    const url = BASE_URL + path;

    // 1. Reuse a recent response when we have one.
    const cached = readCache(db, url, now());
    if (cached) return { data: cached.data, cached: true };

    // 2. Make sure we are inside the free plan's request budget.
    const slot = limiter.take();
    if (!slot.ok) {
      throw new ApiError(
        `Rate limit reached (${RATE_LIMIT_MAX} requests per minute on the free plan). ` +
          `Try again in ${Math.ceil(slot.retryAfterMs / 1000)}s.`,
        { status: 429, code: 'rate_limited', retryAfterMs: slot.retryAfterMs }
      );
    }

    // 3. Call the API with the key in the header (never in the URL).
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { 'X-Auth-Token': apiKey, Accept: 'application/json' },
      });
    } catch (error) {
      throw new ApiError(`Could not reach football-data.org: ${error.message}`, {
        status: 502,
        code: 'network_error',
      });
    }

    // 4. Turn API-side failures into readable errors.
    if (response.status === 429) {
      const resetSeconds = Number(response.headers?.get?.('X-RequestCounter-Reset'));
      const retryAfterMs = Number.isFinite(resetSeconds) && resetSeconds > 0
        ? resetSeconds * 1000
        : RATE_LIMIT_WINDOW_MS;
      throw new ApiError(
        'The football API rate limit was hit. Please wait a minute and try again.',
        { status: 429, code: 'rate_limited', retryAfterMs }
      );
    }

    if (response.status === 403 || response.status === 401) {
      throw new ApiError(
        'football-data.org rejected the API key. Check FOOTBALL_API_KEY in your .env file.',
        { status: 502, code: 'invalid_api_key' }
      );
    }

    if (!response.ok) {
      let detail = '';
      try {
        const body = await response.json();
        detail = body?.message ? `: ${body.message}` : '';
      } catch {
        // The error body was not JSON, the status code is enough.
      }
      throw new ApiError(`football-data.org returned ${response.status}${detail}`, {
        status: 502,
        code: 'upstream_error',
      });
    }

    // 5. Cache what we got, then return it.
    const data = await response.json();
    writeCache(db, url, data, now());
    return { data, cached: false };
  }

  return { get };
}
