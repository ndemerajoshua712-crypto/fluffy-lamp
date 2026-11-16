// Tests for the W/D/L form calculation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { outcomeFor, recentForm, formLetters } from './form.js';

const TEAM = 1;

// A small helper to build a finished match.
function finished({ id, date, home, away, status = 'FINISHED' }) {
  const winner = home === away ? 'DRAW' : home > away ? 'HOME_TEAM' : 'AWAY_TEAM';
  return {
    id,
    utcDate: date,
    status,
    homeTeam: { id: TEAM, name: 'Our Team' },
    awayTeam: { id: 2, name: 'Other Team' },
    score: { winner, fullTime: { home, away } },
  };
}

test('outcomeFor reads a win, draw and loss from the score', () => {
  assert.equal(outcomeFor(finished({ id: 1, date: '2026-01-01', home: 3, away: 1 }), TEAM), 'W');
  assert.equal(outcomeFor(finished({ id: 2, date: '2026-01-02', home: 1, away: 1 }), TEAM), 'D');
  assert.equal(outcomeFor(finished({ id: 3, date: '2026-01-03', home: 0, away: 2 }), TEAM), 'L');
});

test('outcomeFor works from the away side too', () => {
  const match = finished({ id: 4, date: '2026-01-04', home: 0, away: 2 });
  assert.equal(outcomeFor(match, 2), 'W'); // the away team won
  assert.equal(outcomeFor(match, TEAM), 'L');
});

test('outcomeFor ignores matches that are not finished', () => {
  const match = { ...finished({ id: 5, date: '2026-01-05', home: 1, away: 0 }), status: 'SCHEDULED' };
  assert.equal(outcomeFor(match, TEAM), 'W'); // reading a score still works
  assert.equal(recentForm([match], TEAM).length, 0); // but it is not form yet
});

test('recentForm returns only the last five, newest first', () => {
  const matches = Array.from({ length: 8 }, (_, i) =>
    finished({
      id: i + 1,
      date: `2026-01-0${i + 1}`,
      home: i % 3, // mixes wins, draws and losses
      away: 1,
    })
  );

  const form = recentForm(matches, TEAM);
  assert.equal(form.length, 5);
  // Newest match first: 2026-01-08 down to 2026-01-04.
  assert.deepEqual(
    form.map((r) => r.utcDate),
    ['2026-01-08', '2026-01-07', '2026-01-06', '2026-01-05', '2026-01-04']
  );
});

test('formLetters gives W/D/L letters and names the opponent', () => {
  const matches = [
    finished({ id: 1, date: '2026-02-01', home: 2, away: 0 }), // W
    finished({ id: 2, date: '2026-02-08', home: 0, away: 0 }), // D
    finished({ id: 3, date: '2026-02-15', home: 0, away: 1 }), // L
  ];

  assert.deepEqual(formLetters(matches, TEAM), ['L', 'D', 'W']); // newest first
  const last = recentForm(matches, TEAM)[0];
  assert.equal(last.opponent.name, 'Other Team');
  assert.equal(last.teamScore, 0);
  assert.equal(last.opponentScore, 1);
});

test('matches where the team did not play are ignored', () => {
  const other = finished({ id: 9, date: '2026-03-01', home: 1, away: 0 });
  other.homeTeam = { id: 7, name: 'Someone' };
  other.awayTeam = { id: 8, name: 'Else' };
  assert.equal(outcomeFor(other, TEAM), null);
  assert.deepEqual(recentForm([other], TEAM), []);
});
