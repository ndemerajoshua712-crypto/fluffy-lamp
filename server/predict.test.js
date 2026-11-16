// Tests for the match prediction model.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  poissonPmf,
  outcomeProbabilities,
  goalRates,
  leagueAverage,
  predictMatch,
  cardPrediction,
  rankFor,
  DATA_GAPS,
} from './predict.js';

// A finished match helper. `forGoals` belongs to team 1 (the home team by default).
function match({ id = 1, date = '2026-01-01', home = 1, away = 2, hs = 1, as = 1, status = 'FINISHED', bookings } = {}) {
  const winner = hs === as ? 'DRAW' : hs > as ? 'HOME_TEAM' : 'AWAY_TEAM';
  return {
    id,
    utcDate: date,
    status,
    homeTeam: { id: home, name: `Team ${home}` },
    awayTeam: { id: away, name: `Team ${away}` },
    score: status === 'FINISHED' ? { winner, fullTime: { home: hs, away: as } } : { winner: null },
    ...(bookings ? { bookings } : {}),
  };
}

test('poissonPmf sums to about 1 and matches the textbook values', () => {
  let total = 0;
  for (let k = 0; k <= 30; k += 1) total += poissonPmf(k, 1.5);
  assert.ok(Math.abs(total - 1) < 1e-6);

  // P(0 goals | lambda 1.5) = e^-1.5
  assert.ok(Math.abs(poissonPmf(0, 1.5) - Math.exp(-1.5)) < 1e-9);
  assert.equal(poissonPmf(3, 0), 0);
});

test('outcome probabilities add up and favour the stronger side', () => {
  const strong = outcomeProbabilities(2.2, 0.6);
  assert.equal(strong.homeWin + strong.draw + strong.awayWin, 100);
  assert.ok(strong.homeWin > 60, `expected a clear home edge, got ${strong.homeWin}%`);
  assert.ok(strong.awayWin < strong.draw);

  const even = outcomeProbabilities(1.3, 1.3);
  assert.ok(Math.abs(even.homeWin - even.awayWin) <= 1);
  assert.ok(even.likelyScores.length === 3);
  // Most likely scoreline for an even, low-scoring game is usually 1-1 or 1-0.
  assert.ok(even.likelyScores[0].probability > 5);
});

test('goalRates ignores other teams, unfinished games and orders by recency', () => {
  const matches = [
    match({ id: 1, date: '2026-01-01', hs: 2, as: 0 }), // win, 2 scored 0 conceded
    match({ id: 2, date: '2026-01-08', hs: 1, as: 3 }), // loss, 1 scored 3 conceded
    match({ id: 3, date: '2026-01-15', hs: 4, as: 1 }), // win, 4 scored
    { ...match({ id: 4, date: '2026-01-20' }), status: 'SCHEDULED' }, // not played
    match({ id: 5, date: '2026-01-21', home: 7, away: 8 }), // different teams
  ];

  const rates = goalRates(matches, 1, 10);
  assert.equal(rates.sample, 3); // three real finished games
  assert.equal(rates.goalsForPerMatch, 2.33); // (2 + 1 + 4) / 3
  assert.equal(rates.goalsAgainstPerMatch, 1.33); // (0 + 3 + 1) / 3
  assert.equal(rates.home.sample, 3);
});

test('goalRates limits the sample to the most recent matches', () => {
  const matches = Array.from({ length: 12 }, (_, i) =>
    match({ id: i + 1, date: `2026-01-${String(i + 1).padStart(2, '0')}`, hs: i, as: 0 })
  );
  const rates = goalRates(matches, 1, 5);
  assert.equal(rates.sample, 5);
  // Newest five games scored 11, 10, 9, 8, 7 => average 9
  assert.equal(rates.goalsForPerMatch, 9);
});

test('leagueAverage comes from the table goals per team per match', () => {
  const standings = [
    { team: { id: 1 }, played: 10, goalsFor: 20 },
    { team: { id: 2 }, played: 10, goalsFor: 15 },
  ];
  // 35 goals over 20 team-matches
  assert.equal(leagueAverage(standings), 1.75);
  assert.equal(leagueAverage([]), 1.35); // fallback when there is no table
});

test('predictMatch gives the better side a higher expected score', () => {
  const homeMatches = Array.from({ length: 6 }, (_, i) =>
    match({ id: i + 1, date: `2026-02-0${i + 1}`, hs: 3, as: 0 })
  );
  const awayMatches = Array.from({ length: 6 }, (_, i) =>
    match({ id: i + 20, date: `2026-02-0${i + 1}`, home: 3, away: 2, hs: 1, as: 0 })
  );

  const result = predictMatch({
    homeTeam: { id: 1, name: 'Strong' },
    awayTeam: { id: 2, name: 'Weak' },
    homeMatches,
    awayMatches,
    standings: [
      { team: { id: 1, name: 'Strong' }, position: 1, played: 10, points: 25, goalsFor: 25, goalsAgainst: 8, goalDifference: 17 },
      { team: { id: 2, name: 'Weak' }, position: 12, played: 10, points: 6, goalsFor: 8, goalsAgainst: 22, goalDifference: -14 },
    ],
  });

  assert.ok(result.prediction.expectedGoals.home > result.prediction.expectedGoals.away);
  assert.equal(result.home.rank.position, 1);
  assert.equal(result.away.rank.position, 12);
  assert.deepEqual(result.home.form.slice(0, 3), ['W', 'W', 'W']);
  assert.ok(result.prediction.expectedGoals.total > 0);
  assert.ok(result.prediction.homeWin > result.prediction.awayWin);
});

test('predictMatch is honest about small samples and missing data', () => {
  const result = predictMatch({
    homeTeam: { id: 1, name: 'No data' },
    awayTeam: { id: 2, name: 'Also none' },
    homeMatches: [],
    awayMatches: [],
    standings: null,
  });

  // Falls back to a sane league-average style estimate rather than 0 or NaN.
  assert.ok(result.prediction.expectedGoals.home > 0);
  assert.ok(Number.isFinite(result.prediction.expectedGoals.total));
  assert.ok(result.notes.some((n) => /only 0 finished match/.test(n)));
  assert.equal(result.home.rank, null);
  assert.equal(result.corners.available, false);
  assert.equal(result.injuries.available, false);
  assert.equal(result.cards.available, false);
  assert.match(result.corners.reason, /corner/i);
});

test('cards are reported unavailable on free-plan data, measured when bookings exist', () => {
  const withoutBookings = cardPrediction([match({ id: 1 })], [], 1, 2);
  assert.equal(withoutBookings.available, false);
  assert.equal(withoutBookings.reason, DATA_GAPS.cards.reason);

  const withBookings = cardPrediction(
    [
      match({ id: 1, bookings: [{ card: 'YELLOW' }, { card: 'YELLOW' }] }),
      match({ id: 2, date: '2026-01-02', bookings: [{ card: 'YELLOW' }, { card: 'RED' }, { card: 'YELLOW' }] }),
    ],
    [],
    1,
    2
  );
  assert.equal(withBookings.available, true);
  assert.equal(withBookings.expectedTotal, 2.5); // (2 + 3) / 2
  assert.equal(withBookings.sample, 2);
});

test('rankFor returns null for a team that is not in the table', () => {
  const standings = [{ team: { id: 5 }, position: 3, points: 20, played: 10, goalDifference: 4 }];
  assert.equal(rankFor(standings, 5).position, 3);
  assert.equal(rankFor(standings, 99), null);
  assert.equal(rankFor(null, 5), null);
});
