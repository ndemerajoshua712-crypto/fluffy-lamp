// The JSON API our frontend talks to.
//
// Every route returns { data... } on success, or { error, message } with a
// matching HTTP status on failure. The frontend shows `message` to the user.
import express from 'express';
import { ApiError } from './api.js';
import { LEAGUES, findLeague } from './leagues.js';
import { recentForm } from './form.js';
import { predictMatch } from './predict.js';
import { createResearcher, SOURCES } from './research.js';
import { saveMatches, saveStandings } from './db.js';

// Small helper so an async route can fail without crashing the server.
const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

// --- Shape helpers -------------------------------------------------------

// A standings row as the database stores it.
function standingRow(entry) {
  return {
    position: entry.position ?? null,
    team_id: entry.team?.id ?? null,
    team_name: entry.team?.name ?? 'Unknown team',
    played: entry.playedGames ?? 0,
    won: entry.won ?? 0,
    drawn: entry.draw ?? 0,
    lost: entry.lost ?? 0,
    goals_for: entry.goalsFor ?? 0,
    goals_against: entry.goalsAgainst ?? 0,
    goal_difference: entry.goalDifference ?? 0,
    points: entry.points ?? 0,
  };
}

// Even a finished match can be missing goals, so read them defensively.
function goals(match) {
  const home = match.score?.fullTime?.home;
  const away = match.score?.fullTime?.away;
  return typeof home === 'number' && typeof away === 'number' ? { home, away } : null;
}

// A fixture as the frontend sees it.
function fixtureJson(match) {
  const finished = match.status === 'FINISHED';
  const score = goals(match);
  return {
    id: match.id,
    utcDate: match.utcDate,
    status: match.status,
    matchday: match.matchday ?? null,
    homeTeam: match.homeTeam ? { id: match.homeTeam.id, name: match.homeTeam.name } : null,
    awayTeam: match.awayTeam ? { id: match.awayTeam.id, name: match.awayTeam.name } : null,
    score: finished && score ? score : null, // only finished matches show a score
    winner: match.score?.winner ?? null,
  };
}

// A fixture as the database stores it.
function matchRow(league, match) {
  const score = goals(match);
  return {
    id: match.id,
    utc_date: match.utcDate,
    status: match.status,
    matchday: match.matchday ?? null,
    home_team_id: match.homeTeam?.id ?? null,
    home_team_name: match.homeTeam?.name ?? null,
    home_score: score ? score.home : null,
    away_team_id: match.awayTeam?.id ?? null,
    away_team_name: match.awayTeam?.name ?? null,
    away_score: score ? score.away : null,
  };
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// --- Routes -------------------------------------------------------------

export function createRouter({ api, db, researcher, now = () => Date.now() }) {
  const router = express.Router();
  // Web research is optional so tests can inject a fake one.
  const web = researcher ?? createResearcher({ db, now });

  // Are we configured? The client asks this first so it can show a clear
  // "API key missing" message instead of a generic error on every screen.
  router.get('/health', (req, res) => {
    res.json({ ok: true, hasApiKey: Boolean(api.hasApiKey) });
  });

  // The leagues the picker offers.
  router.get('/leagues', (req, res) => {
    res.json({ leagues: LEAGUES });
  });

  // League table.
  router.get(
    '/standings/:league',
    asyncRoute(async (req, res) => {
      const league = findLeague(req.params.league);
      if (!league) {
        throw new ApiError(`Unknown league "${req.params.league}".`, {
          status: 404,
          code: 'unknown_league',
        });
      }

      const { data, cached } = await api.get(`/competitions/${league.code}/standings`);

      const tables = Array.isArray(data.standings) ? data.standings : [];
      // Standings can be split into HOME/AWAY/TOTAL; we want the overall one.
      const total = tables.find((t) => t.type === 'TOTAL') ?? tables[0];
      if (!total || !Array.isArray(total.table)) {
        throw new ApiError(`No standings are available for ${league.name} yet.`, {
          status: 404,
          code: 'no_standings',
        });
      }

      const rows = total.table.map(standingRow);
      saveStandings(db, league.code, rows, now());

      res.json({
        league,
        cached,
        updatedAt: new Date(now()).toISOString(),
        standings: rows.map((r) => ({
          position: r.position,
          team: { id: r.team_id, name: r.team_name },
          played: r.played,
          won: r.won,
          drawn: r.drawn,
          lost: r.lost,
          goalsFor: r.goals_for,
          goalsAgainst: r.goals_against,
          goalDifference: r.goal_difference,
          points: r.points,
        })),
      });
    })
  );

  // Fixtures and recent results, grouped by the client.
  router.get(
    '/fixtures/:league',
    asyncRoute(async (req, res) => {
      const league = findLeague(req.params.league);
      if (!league) {
        throw new ApiError(`Unknown league "${req.params.league}".`, {
          status: 404,
          code: 'unknown_league',
        });
      }

      // A window around today keeps the response small (and the free plan happy).
      const today = new Date(now());
      const from = new Date(today);
      from.setDate(from.getDate() - 14); // recent results
      const to = new Date(today);
      to.setDate(to.getDate() + 21); // upcoming fixtures

      const { data, cached } = await api.get(
        `/competitions/${league.code}/matches?dateFrom=${isoDate(from)}&dateTo=${isoDate(to)}`
      );

      const all = Array.isArray(data.matches) ? data.matches : [];
      saveMatches(db, league.code, all.map((m) => matchRow(league.code, m)), now());

      const fixtures = all.map(fixtureJson);
      const recent = fixtures
        .filter((m) => m.status === 'FINISHED')
        .sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate)) // newest first
        .slice(0, 10);
      const upcoming = fixtures
        .filter((m) => m.status !== 'FINISHED')
        .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate)); // soonest first

      res.json({ league, cached, updatedAt: new Date(now()).toISOString(), recent, upcoming });
    })
  );

  // A team's last five results, as W/D/L form.
  router.get(
    '/team/:id',
    asyncRoute(async (req, res) => {
      const teamId = Number(req.params.id);
      if (!Number.isInteger(teamId) || teamId <= 0) {
        throw new ApiError('Team id must be a positive number.', {
          status: 400,
          code: 'invalid_team_id',
        });
      }

      // Look back far enough to always find five finished matches.
      const to = new Date(now());
      const from = new Date(to);
      from.setDate(from.getDate() - 400);

      const { data, cached } = await api.get(
        `/teams/${teamId}/matches?status=FINISHED&dateFrom=${isoDate(from)}&dateTo=${isoDate(to)}&limit=100`
      );

      const matches = Array.isArray(data.matches) ? data.matches : [];
      const results = recentForm(matches, teamId, 5);

      // The API includes the team name on each match, so take it from there.
      const fromMatches = matches
        .map((m) => (m.homeTeam?.id === teamId ? m.homeTeam : m.awayTeam?.id === teamId ? m.awayTeam : null))
        .find(Boolean);
      const teamName =
        fromMatches?.name || (matches[0]?.homeTeam?.id === teamId ? matches[0].homeTeam.name : null);

      const wins = results.filter((r) => r.outcome === 'W').length;
      const draws = results.filter((r) => r.outcome === 'D').length;
      const losses = results.filter((r) => r.outcome === 'L').length;

      res.json({
        team: { id: teamId, name: teamName },
        cached,
        form: results.map((r) => r.outcome),
        results,
        summary: { wins, draws, losses },
      });
    })
  );

  // Predict a meeting between two teams from their recent results.
  //
  // This uses the same free-plan data as the other routes: finished matches and
  // the league table. Corners, cards and injuries are reported as unavailable
  // rather than guessed (see server/predict.js).
  router.get(
    '/prediction/:homeId/:awayId',
    asyncRoute(async (req, res) => {
      const homeId = Number(req.params.homeId);
      const awayId = Number(req.params.awayId);
      if (!Number.isInteger(homeId) || !Number.isInteger(awayId) || homeId <= 0 || awayId <= 0) {
        throw new ApiError('Team ids must be positive numbers.', {
          status: 400,
          code: 'invalid_team_id',
        });
      }
      if (homeId === awayId) {
        throw new ApiError('Pick two different teams to predict a match.', {
          status: 400,
          code: 'same_team',
        });
      }

      const to = new Date(now());
      const from = new Date(to);
      from.setDate(from.getDate() - 400);
      const filter = `status=FINISHED&dateFrom=${isoDate(from)}&dateTo=${isoDate(to)}&limit=100`;

      // Two requests, both served from the 10-minute cache when possible.
      const [homeRes, awayRes] = await Promise.all([
        api.get(`/teams/${homeId}/matches?${filter}`),
        api.get(`/teams/${awayId}/matches?${filter}`),
      ]);

      const homeMatches = Array.isArray(homeRes.data.matches) ? homeRes.data.matches : [];
      const awayMatches = Array.isArray(awayRes.data.matches) ? awayRes.data.matches : [];
      const allMatches = [...homeMatches, ...awayMatches];

      // The competition both teams play in most often in this window.
      const counts = new Map();
      for (const match of allMatches) {
        const code = match.competition?.code;
        if (!code) continue;
        counts.set(code, (counts.get(code) ?? 0) + 1);
      }
      const competitionCode =
        [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      // Ranking is a bonus: if the table cannot be loaded we still predict.
      let standings = null;
      let standingsError = null;
      if (competitionCode) {
        try {
          const { data } = await api.get(`/competitions/${competitionCode}/standings`);
          const tables = Array.isArray(data.standings) ? data.standings : [];
          const total = tables.find((t) => t.type === 'TOTAL') ?? tables[0];
          standings = (total?.table ?? []).map(standingRow).map((row) => ({
            position: row.position,
            played: row.played,
            points: row.points,
            goalsFor: row.goals_for,
            goalsAgainst: row.goals_against,
            goalDifference: row.goal_difference,
            team: { id: row.team_id, name: row.team_name },
          }));
        } catch (error) {
          standingsError = error.message;
        }
      }

      const nameFor = (id, matches) => {
        for (const match of matches) {
          if (match.homeTeam?.id === id) return match.homeTeam.name;
          if (match.awayTeam?.id === id) return match.awayTeam.name;
        }
        return `Team #${id}`;
      };

      const result = predictMatch({
        homeTeam: { id: homeId, name: nameFor(homeId, homeMatches) },
        awayTeam: { id: awayId, name: nameFor(awayId, awayMatches) },
        homeMatches,
        awayMatches,
        standings,
      });

      const notes = [...result.notes];
      if (standingsError) notes.push(`League table unavailable: ${standingsError}`);

      res.json({
        competition: competitionCode,
        cached: homeRes.cached && awayRes.cached,
        generatedAt: new Date(now()).toISOString(),
        ...result,
        notes,
      });
    })
  );

  // Research a team online: Wikipedia summary plus recent football headlines.
  // No API key is needed for this - the sources are public and free.
  router.get(
    '/research/:teamId',
    asyncRoute(async (req, res) => {
      const teamId = Number(req.params.teamId);
      const name = String(req.query.name ?? '').trim();

      if (!Number.isInteger(teamId) || teamId <= 0) {
        throw new ApiError('Team id must be a positive number.', {
          status: 400,
          code: 'invalid_team_id',
        });
      }
      if (!name) {
        throw new ApiError(
          'A team name is needed for the web search, for example ?name=Arsenal FC.',
          { status: 400, code: 'missing_team_name' }
        );
      }

      const result = await web.research(name);
      res.json({ team: { id: teamId, name }, ...result, sources: SOURCES });
    })
  );

  return router;
}
