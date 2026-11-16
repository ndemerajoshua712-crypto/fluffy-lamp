// App shell: header, theme toggle, league picker, tabs and routes.
import { useEffect, useState } from 'react';
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { LeagueContext } from './league-context.js';
import { useTheme } from './useTheme.js';
import LeaguePicker from './components/LeaguePicker.jsx';
import { MissingKeyBanner, useApiKeyStatus } from './components/States.jsx';
import StandingsPage from './pages/StandingsPage.jsx';
import FixturesPage from './pages/FixturesPage.jsx';
import PredictPage from './pages/PredictPage.jsx';
import TeamPage from './pages/TeamPage.jsx';

function readSavedLeague() {
  try {
    return localStorage.getItem('league') || 'PL';
  } catch {
    return 'PL';
  }
}

export default function App() {
  const { theme, toggle } = useTheme();
  const [league, setLeague] = useState(readSavedLeague);
  const { hasApiKey, serverDown } = useApiKeyStatus();

  // Remember the picked league between visits.
  useEffect(() => {
    try {
      localStorage.setItem('league', league);
    } catch {
      /* not fatal */
    }
  }, [league]);

  return (
    <LeagueContext.Provider value={{ league, setLeague }}>
      <HashRouter>
        <div className="app">
          <header className="topbar">
            <div className="brand">
              <span className="ball" aria-hidden="true">
                ⚽
              </span>
              <h1>Footy Stats</h1>
            </div>
            <button
              type="button"
              className="theme-toggle"
              onClick={toggle}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
            </button>
          </header>

          <main className="content">
            {serverDown ? (
              <div className="banner" role="alert">
                <strong>API server not reachable.</strong>
                <span>Start it with <code>npm run dev:api</code> in another terminal.</span>
              </div>
            ) : null}

            {!hasApiKey ? <MissingKeyBanner /> : null}

            <LeaguePicker />

            <nav className="tabs" aria-label="Sections">
              <NavLink to="/" end className={({ isActive }) => (isActive ? 'tab tab-active' : 'tab')}>
                Standings
              </NavLink>
              <NavLink to="/fixtures" className={({ isActive }) => (isActive ? 'tab tab-active' : 'tab')}>
                Fixtures
              </NavLink>
              <NavLink to="/predict" className={({ isActive }) => (isActive ? 'tab tab-active' : 'tab')}>
                Predict
              </NavLink>
            </nav>

            <Routes>
              <Route path="/" element={<StandingsPage />} />
              <Route path="/fixtures" element={<FixturesPage />} />
              <Route path="/predict" element={<PredictPage />} />
              <Route path="/team/:id" element={<TeamPage />} />
              <Route
                path="*"
                element={<p className="empty">This page does not exist. Use the tabs above.</p>}
              />
            </Routes>
          </main>

          <footer className="footer muted small">
            Data from football-data.org · responses cached for 10 minutes
          </footer>
        </div>
      </HashRouter>
    </LeagueContext.Provider>
  );
}
