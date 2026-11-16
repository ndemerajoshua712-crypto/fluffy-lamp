// The leagues we offer in the picker.
//
// These are competitions the football-data.org free plan covers. If a league
// is not in this list the server will not call the API for it.
export const LEAGUES = [
  { code: 'PL', name: 'Premier League', country: 'England' },
  { code: 'PD', name: 'La Liga', country: 'Spain' },
  { code: 'SA', name: 'Serie A', country: 'Italy' },
  { code: 'BL1', name: 'Bundesliga', country: 'Germany' },
  { code: 'FL1', name: 'Ligue 1', country: 'France' },
  { code: 'DED', name: 'Eredivisie', country: 'Netherlands' },
  { code: 'PPL', name: 'Primeira Liga', country: 'Portugal' },
  { code: 'BSA', name: 'Brasileirão Série A', country: 'Brazil' },
  { code: 'CL', name: 'Champions League', country: 'Europe' },
];

/** Find a league by its code, ignoring case. Returns undefined if unknown. */
export function findLeague(code) {
  if (!code) return undefined;
  return LEAGUES.find((l) => l.code.toLowerCase() === String(code).toLowerCase());
}
