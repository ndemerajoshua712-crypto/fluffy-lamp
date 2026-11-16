// Estimating what a match might look like, using only the data the free plan
// returns: finished match scores and league tables.
//
// The method is deliberately simple so every number is traceable:
//   1. For each team, average the goals it scored and conceded over its last
//      10 finished matches. Prefer home/away form when there are 3+ matches
//      on that side.
//   2. Turn those averages into "attack" and "defence" ratios against the
//      league average (goals per team per match, taken from the table).
//   3. Multiply the league average by both ratios, with a small home boost.
//   4. Feed the two expected-goal values into independent Poisson
//      distributions to get win/draw/loss chances and likely scorelines.
//
// Corners, cards and injuries are NOT estimated from nothing: this API does not
// provide them on the free plan, so they are reported as unavailable.
import { formLetters } from './form.js';

const MAX_GOALS = 8; // scoreline grid size for the Poisson maths
const HOME_BOOST = 1.12; // home teams score a bit more
const AWAY_DAMP = 0.95; // ...and away teams a bit less
const SHRINK = 6; // with few matches, lean on the league average
const DEFAULT_LEAGUE_AVG = 1.35; // goals per team per match fallback
const DEFAULT_LIMIT = 10;
const MIN_SPLIT_SAMPLE = 3; // home/away split needs at least this many games

/** What this API cannot tell us, in plain words for the UI. */
export const DATA_GAPS = {
  corners: {
    available: false,
    label: 'Corners',
    reason:
      'football-data.org does not publish corner counts at all; detailed match statistics are a separate paid add-on.',
  },
  cards: {
    available: false,
    label: 'Cards',
    reason:
      'Bookings and cards only come with football-data.org paid tiers, so the free plan cannot count them.',
  },
  injuries: {
    available: false,
    label: 'Injuries',
    reason:
      'football-data.org has no injuries, suspensions or player availability data on any plan.',
  },
};

const round1 = (value) => Math.round(value * 10) / 10;
const round2 = (value) => Math.round(value * 100) / 100;
const clamp = (value, min = 0.15, max = 4.5) => Math.min(max, Math.max(min, value));

/** Poisson probability of exactly k goals when the average is lambda. */
export function poissonPmf(k, lambda) {
  if (k < 0) return 0;
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i += 1) logP -= Math.log(i);
  return Math.exp(logP);
}

/**
 * Win/draw/loss percentages plus a few extras, from two expected-goal values.
 * We multiply two Poisson distributions over a small goal grid.
 */
export function outcomeProbabilities(homeXg, awayXg, maxGoals = MAX_GOALS) {
  let home = 0;
  let draw = 0;
  let away = 0;
  let over25 = 0;
  let btts = 0;
  const scores = [];

  for (let h = 0; h <= maxGoals; h += 1) {
    const pHome = poissonPmf(h, homeXg);
    for (let a = 0; a <= maxGoals; a += 1) {
      const p = pHome * poissonPmf(a, awayXg);
      if (h > a) home += p;
      else if (h === a) draw += p;
      else away += p;
      if (h + a >= 3) over25 += p;
      if (h > 0 && a > 0) btts += p;
      scores.push({ home: h, away: a, probability: p });
    }
  }

  const total = home + draw + away || 1;
  const homeWin = Math.round((home / total) * 100);
  const awayWin = Math.round((away / total) * 100);

  return {
    homeWin,
    draw: Math.max(0, 100 - homeWin - awayWin), // keeps the three adding up to 100
    awayWin,
    over25: Math.round((over25 / total) * 100),
    bothTeamsScore: Math.round((btts / total) * 100),
    likelyScores: scores
      .sort((x, y) => y.probability - x.probability)
      .slice(0, 3)
      .map((s) => ({
        home: s.home,
        away: s.away,
        probability: Math.round((s.probability / total) * 1000) / 10,
      })),
  };
}

/**
 * A team's goals scored/conceded per match over its most recent finished games.
 * Returns nulls where there is not enough data, never made-up numbers.
 */
export function goalRates(matches, teamId, limit = DEFAULT_LIMIT) {
  const id = Number(teamId);

  const games = (matches || [])
    .filter((m) => m.status === 'FINISHED')
    .filter((m) => m.homeTeam?.id === id || m.awayTeam?.id === id)
    .map((m) => {
      const atHome = m.homeTeam?.id === id;
      return {
        utcDate: m.utcDate,
        atHome,
        goalsFor: atHome ? m.score?.fullTime?.home : m.score?.fullTime?.away,
        goalsAgainst: atHome ? m.score?.fullTime?.away : m.score?.fullTime?.home,
      };
    })
    .filter((g) => Number.isFinite(g.goalsFor) && Number.isFinite(g.goalsAgainst))
    .sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate))
    .slice(0, limit);

  const mean = (values) =>
    values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
  const split = (isHome) => {
    const subset = games.filter((g) => g.atHome === isHome);
    return {
      sample: subset.length,
      goalsForPerMatch: round2(mean(subset.map((g) => g.goalsFor)) ?? NaN) || null,
      goalsAgainstPerMatch: round2(mean(subset.map((g) => g.goalsAgainst)) ?? NaN) || null,
    };
  };

  return {
    sample: games.length,
    goalsForPerMatch: round2(mean(games.map((g) => g.goalsFor)) ?? NaN) || null,
    goalsAgainstPerMatch: round2(mean(games.map((g) => g.goalsAgainst)) ?? NaN) || null,
    home: split(true),
    away: split(false),
  };
}

/** Average goals per team per match across a league table. */
export function leagueAverage(standings) {
  if (!Array.isArray(standings) || standings.length === 0) return DEFAULT_LEAGUE_AVG;

  let goals = 0;
  let teamMatches = 0;
  for (const row of standings) {
    const played = Number(row.played);
    const goalsFor = Number(row.goalsFor);
    if (Number.isFinite(played) && Number.isFinite(goalsFor) && played > 0) {
      goals += goalsFor;
      teamMatches += played;
    }
  }
  if (!teamMatches) return DEFAULT_LEAGUE_AVG;
  return goals / teamMatches;
}

/** Ratio against the league average, pulled towards 1 when the sample is small. */
function shrinkRatio(perMatch, average, sample) {
  if (!Number.isFinite(perMatch) || !Number.isFinite(average) || average <= 0) return 1;
  const raw = perMatch / average;
  const weight = (sample || 0) / ((sample || 0) + SHRINK);
  return 1 + (raw - 1) * weight;
}

/** Where a team sits in the table, if we have a table. */
export function rankFor(standings, teamId) {
  const row = (standings || []).find((r) => r.team?.id === Number(teamId));
  if (!row) return null;
  return {
    position: row.position ?? null,
    points: row.points ?? null,
    played: row.played ?? null,
    goalDifference: row.goalDifference ?? null,
  };
}

/**
 * Expected cards, but only if the API actually included bookings.
 * On the free plan it does not, so this returns the "unavailable" note.
 */
export function cardPrediction(homeMatches, awayMatches, homeId, awayId, limit = DEFAULT_LIMIT) {
  const byId = new Map();
  for (const match of [...(homeMatches || []), ...(awayMatches || [])]) {
    if (match.status !== 'FINISHED') continue;
    if (!Array.isArray(match.bookings)) continue; // free plan: no bookings field
    const involvesUs = match.homeTeam?.id === homeId || match.awayTeam?.id === awayId;
    if (involvesUs) byId.set(match.id, match);
  }

  const games = [...byId.values()]
    .sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate))
    .slice(0, limit);

  if (games.length === 0) return { ...DATA_GAPS.cards };

  const total = games.reduce((sum, m) => sum + m.bookings.length, 0);
  return {
    available: true,
    label: 'Cards',
    expectedTotal: round1(total / games.length),
    sample: games.length,
    reason: `Average total cards in the last ${games.length} matches involving these teams.`,
  };
}

/** Build the whole prediction from raw match lists and an optional table. */
export function predictMatch({
  homeTeam,
  awayTeam,
  homeMatches = [],
  awayMatches = [],
  standings = null,
  limit = DEFAULT_LIMIT,
}) {
  const average = leagueAverage(standings);
  const homeId = Number(homeTeam.id);
  const awayId = Number(awayTeam.id);

  const home = goalRates(homeMatches, homeId, limit);
  const away = goalRates(awayMatches, awayId, limit);

  // Prefer venue-specific form when there is enough of it.
  const homeAttack =
    home.home.sample >= MIN_SPLIT_SAMPLE ? home.home.goalsForPerMatch : home.goalsForPerMatch;
  const homeDefence =
    home.home.sample >= MIN_SPLIT_SAMPLE ? home.home.goalsAgainstPerMatch : home.goalsAgainstPerMatch;
  const awayAttack =
    away.away.sample >= MIN_SPLIT_SAMPLE ? away.away.goalsForPerMatch : away.goalsForPerMatch;
  const awayDefence =
    away.away.sample >= MIN_SPLIT_SAMPLE ? away.away.goalsAgainstPerMatch : away.goalsAgainstPerMatch;

  const xgHome = round1(
    clamp(
      average *
        shrinkRatio(homeAttack, average, home.sample) *
        shrinkRatio(awayDefence, average, away.sample) *
        HOME_BOOST
    )
  );
  const xgAway = round1(
    clamp(
      average *
        shrinkRatio(awayAttack, average, away.sample) *
        shrinkRatio(homeDefence, average, home.sample) *
        AWAY_DAMP
    )
  );

  const outcomes = outcomeProbabilities(xgHome, xgAway);

  const notes = [];
  if (home.sample < MIN_SPLIT_SAMPLE) {
    notes.push(
      `${homeTeam.name} has only ${home.sample} finished match(es) in the last year, so this leans on the league average.`
    );
  }
  if (away.sample < MIN_SPLIT_SAMPLE) {
    notes.push(
      `${awayTeam.name} has only ${away.sample} finished match(es) in the last year, so this leans on the league average.`
    );
  }
  if (!standings) {
    notes.push('No league table was available, so the league average is a general fallback.');
  }
  notes.push('An estimate from recent results, not a guarantee.');

  return {
    home: {
      id: homeId,
      name: homeTeam.name,
      form: formLetters(homeMatches, homeId, 5),
      sample: home.sample,
      goalsForPerMatch: home.goalsForPerMatch,
      goalsAgainstPerMatch: home.goalsAgainstPerMatch,
      rank: rankFor(standings, homeId),
    },
    away: {
      id: awayId,
      name: awayTeam.name,
      form: formLetters(awayMatches, awayId, 5),
      sample: away.sample,
      goalsForPerMatch: away.goalsForPerMatch,
      goalsAgainstPerMatch: away.goalsAgainstPerMatch,
      rank: rankFor(standings, awayId),
    },
    prediction: {
      expectedGoals: {
        home: xgHome,
        away: xgAway,
        total: round1(xgHome + xgAway),
      },
      ...outcomes,
    },
    cards: cardPrediction(homeMatches, awayMatches, homeId, awayId, limit),
    corners: { ...DATA_GAPS.corners },
    injuries: { ...DATA_GAPS.injuries },
    leagueAverage: round2(average),
    notes,
  };
}
