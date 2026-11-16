// Turning match results into W / D / L form.
//
// The frontend shows the last five results for a team, so this file holds the
// pure calculation with no network or database code. That makes it easy to test.

/**
 * Work out the result of one match from one team's point of view.
 * Returns 'W', 'D', 'L' or null when the match is not a finished result.
 */
export function outcomeFor(match, teamId) {
  const id = Number(teamId);
  const isHome = match.homeTeam?.id === id;
  const isAway = match.awayTeam?.id === id;
  if (!isHome && !isAway) return null;

  // football-data.org gives us the winner directly on finished matches.
  const winner = match.score?.winner;
  if (winner === 'DRAW') return 'D';
  if (winner === 'HOME_TEAM' || winner === 'AWAY_TEAM') {
    const teamWon =
      (winner === 'HOME_TEAM' && isHome) || (winner === 'AWAY_TEAM' && isAway);
    return teamWon ? 'W' : 'L';
  }

  // Fallback: compare the goals if there is no winner field.
  const homeGoals = match.score?.fullTime?.home;
  const awayGoals = match.score?.fullTime?.away;
  if (typeof homeGoals !== 'number' || typeof awayGoals !== 'number') return null;

  const teamGoals = isHome ? homeGoals : awayGoals;
  const otherGoals = isHome ? awayGoals : homeGoals;
  if (teamGoals === otherGoals) return 'D';
  return teamGoals > otherGoals ? 'W' : 'L';
}

/**
 * The team's last `limit` finished matches, newest first.
 * Each item is a small summary the UI can render directly.
 */
export function recentForm(matches, teamId, limit = 5) {
  const id = Number(teamId);

  return matches
    .filter((m) => m.status === 'FINISHED')
    .filter((m) => outcomeFor(m, id) !== null)
    .sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate)) // newest first
    .slice(0, limit)
    .map((m) => {
      const isHome = m.homeTeam?.id === id;
      const opponent = isHome ? m.awayTeam : m.homeTeam;
      return {
        matchId: m.id,
        utcDate: m.utcDate,
        competition: m.competition?.name ?? null,
        outcome: outcomeFor(m, id),
        home: isHome,
        teamScore: isHome ? m.score?.fullTime?.home : m.score?.fullTime?.away,
        opponentScore: isHome ? m.score?.fullTime?.away : m.score?.fullTime?.home,
        opponent: opponent ? { id: opponent.id, name: opponent.name } : null,
      };
    });
}

/** Just the letters, e.g. ['W', 'W', 'D', 'L', 'W']. */
export function formLetters(matches, teamId, limit = 5) {
  return recentForm(matches, teamId, limit).map((r) => r.outcome);
}
