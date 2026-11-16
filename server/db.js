
// Sets up the SQLite database using Node.js built-in SQLite.

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(import.meta.dirname, 'data');

/**
 * Open or create the database.
 * Pass ':memory:' for temporary test databases.
 */
export function openDb(file = path.join(DATA_DIR, 'football.db')) {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }

  const db = new DatabaseSync(file);

  if (file !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS standings (
      league TEXT NOT NULL,
      team_id INTEGER NOT NULL,
      position INTEGER,
      team_name TEXT,
      played INTEGER,
      won INTEGER,
      drawn INTEGER,
      lost INTEGER,
      goals_for INTEGER,
      goals_against INTEGER,
      goal_difference INTEGER,
      points INTEGER,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (league, team_id)
    );

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY,
      league TEXT,
      utc_date TEXT,
      status TEXT,
      matchday INTEGER,
      home_team_id INTEGER,
      home_team_name TEXT,
      home_score INTEGER,
      away_team_id INTEGER,
      away_team_name TEXT,
      away_score INTEGER,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cache (
      url TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    );
  `);

  return db;
}

/**
 * Execute a group of database operations atomically.
 */
function transaction(db, callback) {
  db.exec('BEGIN');

  try {
    callback();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** Save league standings. */
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

  transaction(db, () => {
    for (const row of rows) {
      insert.run({
        ...row,
        league,
        updated_at: now
      });
    }
  });
}

/** Save matches. */
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

  transaction(db, () => {
    for (const match of matches) {
      insert.run({
        ...match,
        league,
        updated_at: now
      });
    }
  });
}
