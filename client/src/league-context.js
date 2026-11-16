// The selected league is shared by every screen, so it lives in a context.
import { createContext, useContext } from 'react';

export const LeagueContext = createContext({ league: 'PL', setLeague: () => {} });

export function useLeague() {
  return useContext(LeagueContext);
}
