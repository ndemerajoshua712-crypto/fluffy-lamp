// Sets up the SQLite database.
//
// Three tables are used:
//   standings - one row per team in a league table (latest copy we fetched)
//   matches   - one row per fixture/result we fetched
//   cache     - raw API responses, so we can reuse them for 10 minutes
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(import.meta.dirname, 'data');

/**
 * Open (or create) the database and make sure the tables exist.
 * Pass ':memory:' to get a throwaway database, which the tests use.
 */
export function openDb(file = path.join(DATA_DIR, 'football.db')) {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }

  const db = new Database(file);

  // WAL keeps reads fast while we write cached responses.
  if (file !== ':memory:') db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS standings (
      league         TEXT    NOT NULL,
      team_id        INTEGER NOT NULL,
      position       INTEGER,
      team_name      TEXT,
      played         INTEGER,
      won            INTEGER,
      drawn          INTEGER,
      lost           INTEGER,
      goals_for      INTEGER,
      goals_against  INTEGER,
      goal_difference INTEGER,
      points         INTEGER,
      updated_at     INTEGER NOT NULL,
      PRIMARY KEY (league, team_id)
    );

    CREATE TABLE IF NOT EXISTS matches (
      id             INTEGER PRIMARY KEY,
      league         TEXT,
      utc_date       TEXT,
      status         TEXT,
      matchday       INTEGER,
      home_team_id   INTEGER,
      home_team_name TEXT,
      home_score     INTEGER,
      away_team_id   INTEGER,
      away_team_name TEXT,
      away_score     INTEGER,
      updated_at     INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cache (
      url        TEXT PRIMARY KEY,
      json       TEXT    NOT NULL,
      fetched_at INTEGER NOT NULL
    );
  `);

  return db;
}

/** Save a league table into the standings table (replacing the old copy). */
export function saveStandings(db, league, rows, now = Date.now()) {
  const insert = db.prepare(`
    INSERT INTO standings (
      league, team_id, position, team_name, played, won, drawn, lost,
      goals_for, goals_against, goal_difference, points, updated_at
    ) VALUES (
      @league, @team_id, @position, @team_name, @played, @won, @drawn, @lost,
      @goals_for, @goals_against, @goal_difference, @points, @updated_at
    )
    ON CONFLICT (league, team_id) DO UPDATE SET
      position = excluded.position,
      team_name = excluded.team_name,
      played = excluded.played,
      won = excluded.won,
      drawn = excluded.drawn,
      lost = excluded.lost,
      goals_for = excluded.goals_for,
      goals_against = excluded.goals_against,
      goal_difference = excluded.goal_difference,
      points = excluded.points,
      updated_at = excluded.updated_at
  `);

  // A transaction keeps a whole table refresh atomic.
  const saveAll = db.transaction((items) => {
    for (const row of items) insert.run({ ...row, league, updated_at: now });
  });
  saveAll(rows);
}

/** Save matches into the matches table (insert or update by match id). */
export function saveMatches(db, league, matches, now = Date.now()) {
  const insert = db.prepare(`
    INSERT INTO matches (
      id, league, utc_date, status, matchday,
      home_team_id, home_team_name, home_score,
      away_team_id, away_team_name, away_score, updated_at
    ) VALUES (
      @id, @league, @utc_date, @status, @matchday,
      @home_team_id, @home_team_name, @home_score,
      @away_team_id, @away_team_name, @away_score, @updated_at
    )
    ON CONFLICT (id) DO UPDATE SET
      league = excluded.league,
      utc_date = excluded.utc_date,
      status = excluded.status,
      matchday = excluded.matchday,
      home_team_id = excluded.home_team_id,
      home_team_name = excluded.home_team_name,
      home_score = excluded.home_score,
      away_team_id = excluded.away_team_id,
      away_team_name = excluded.away_team_name,
      away_score = excluded.away_score,
      updated_at = excluded.updated_at
  `);

  const saveAll = db.transaction((items) => {
    for (const m of items) insert.run({ ...m, league, updated_at: now });
  });
  saveAll(matches);
}
