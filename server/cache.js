// A very small cache on top of the SQLite `cache` table.
//
// Every API response is stored by its full URL. While the stored copy is
// younger than the time-to-live (10 minutes by default) we reuse it instead
// of calling football-data.org again.

export const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Look up a cached response.
 * Returns { data, fetchedAt, ageMs } when fresh, or null when missing/stale.
 * `now` is injectable so tests can fake the clock.
 */
export function readCache(db, url, now = Date.now(), ttlMs = CACHE_TTL_MS) {
  const row = db
    .prepare('SELECT json, fetched_at FROM cache WHERE url = ?')
    .get(url);

  if (!row) return null;

  const ageMs = now - row.fetched_at;
  if (ageMs > ttlMs) return null; // too old, caller should fetch again

  return { data: JSON.parse(row.json), fetchedAt: row.fetched_at, ageMs };
}

/** Store (or replace) a response for a URL. */
export function writeCache(db, url, data, now = Date.now()) {
  db.prepare(
    `INSERT INTO cache (url, json, fetched_at) VALUES (?, ?, ?)
     ON CONFLICT (url) DO UPDATE SET json = excluded.json, fetched_at = excluded.fetched_at`
  ).run(url, JSON.stringify(data), now);
}

/** True when a stored copy exists but is older than the TTL. */
export function isStale(db, url, now = Date.now(), ttlMs = CACHE_TTL_MS) {
  const row = db.prepare('SELECT fetched_at FROM cache WHERE url = ?').get(url);
  if (!row) return false; // nothing cached yet is not the same as "stale"
  return now - row.fetched_at > ttlMs;
}
