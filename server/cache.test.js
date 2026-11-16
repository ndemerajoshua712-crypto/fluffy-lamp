// Tests for the 10-minute cache and the way the API client uses it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.js';
import { CACHE_TTL_MS, readCache, writeCache, isStale } from './cache.js';
import { createFootballApi, createRateLimiter } from './api.js';

const URL = 'https://api.football-data.org/v4/competitions/PL/standings';

test('a fresh cache entry is returned', () => {
  const db = openDb(':memory:');
  const t0 = 1_700_000_000_000;
  writeCache(db, URL, { hello: 'world' }, t0);

  const hit = readCache(db, URL, t0 + 60_000);
  assert.deepEqual(hit.data, { hello: 'world' });
  assert.equal(hit.ageMs, 60_000);
});

test('an entry older than 10 minutes is treated as a miss', () => {
  const db = openDb(':memory:');
  const t0 = 1_700_000_000_000;
  writeCache(db, URL, { hello: 'world' }, t0);

  // Exactly at the TTL is still fresh, one millisecond later is not.
  assert.ok(readCache(db, URL, t0 + CACHE_TTL_MS));
  assert.equal(readCache(db, URL, t0 + CACHE_TTL_MS + 1), null);
  assert.equal(isStale(db, URL, t0 + CACHE_TTL_MS + 1), true);
});

test('an unknown URL is a miss (and stale is not the same as missing)', () => {
  const db = openDb(':memory:');
  assert.equal(readCache(db, URL), null);
  assert.equal(isStale(db, URL), false);
});

test('writing the same URL again refreshes the stored copy', () => {
  const db = openDb(':memory:');
  const t0 = 1_700_000_000_000;
  writeCache(db, URL, { version: 1 }, t0);
  writeCache(db, URL, { version: 2 }, t0 + 1000);

  const hit = readCache(db, URL, t0 + 2000);
  assert.deepEqual(hit.data, { version: 2 });
  assert.equal(hit.fetchedAt, t0 + 1000);
  // Still one row, not two.
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cache').get().n, 1);
});

test('the API client serves the second call from cache without fetching again', async () => {
  const db = openDb(':memory:');
  let calls = 0;
  let clock = 1_700_000_000_000;

  const api = createFootballApi({
    apiKey: 'test-key',
    db,
    now: () => clock,
    fetchImpl: async () => {
      calls += 1;
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({ tables: 1 }) };
    },
  });

  const first = await api.get('/competitions/PL/standings');
  assert.equal(first.cached, false);
  assert.equal(calls, 1);

  clock += 5 * 60 * 1000; // five minutes later: still cached
  const second = await api.get('/competitions/PL/standings');
  assert.equal(second.cached, true);
  assert.equal(calls, 1);

  clock += 6 * 60 * 1000; // now eleven minutes in total: fetch again
  const third = await api.get('/competitions/PL/standings');
  assert.equal(third.cached, false);
  assert.equal(calls, 2);
});

test('missing API key gives a clear error instead of a request', async () => {
  const db = openDb(':memory:');
  let called = false;
  const api = createFootballApi({
    apiKey: undefined,
    db,
    fetchImpl: async () => {
      called = true;
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({}) };
    },
  });

  await assert.rejects(() => api.get('/competitions/PL/standings'), (err) => {
    assert.equal(err.status, 503);
    assert.equal(err.code, 'missing_api_key');
    return true;
  });
  assert.equal(called, false);
});

test('the rate limiter refuses the 11th request in a minute', () => {
  let clock = 0;
  const limiter = createRateLimiter({ max: 10, windowMs: 60_000, now: () => clock });

  for (let i = 0; i < 10; i += 1) assert.equal(limiter.take().ok, true);

  const blocked = limiter.take();
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterMs > 0 && blocked.retryAfterMs <= 60_000);

  clock = 61_000; // a new window
  assert.equal(limiter.take().ok, true);
});

test('a 429 from football-data.org becomes a readable rate-limit error', async () => {
  const db = openDb(':memory:');
  const api = createFootballApi({
    apiKey: 'test-key',
    db,
    fetchImpl: async () => ({
      status: 429,
      ok: false,
      headers: { get: (name) => (name === 'X-RequestCounter-Reset' ? '30' : null) },
      json: async () => ({}),
    }),
  });

  await assert.rejects(() => api.get('/competitions/PL/standings'), (err) => {
    assert.equal(err.status, 429);
    assert.equal(err.code, 'rate_limited');
    assert.equal(err.retryAfterMs, 30_000);
    assert.match(err.message, /rate limit/i);
    return true;
  });
});
