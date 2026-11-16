// Standings screen for the selected league.
import { useApi } from '../useApi.js';
import { useLeague } from '../league-context.js';
import StandingsTable from '../components/StandingsTable.jsx';
import { Loading, ErrorNotice } from '../components/States.jsx';

export default function StandingsPage() {
  const { league } = useLeague();
  const { data, loading, error, reload } = useApi(`/standings/${league}`);

  if (loading) return <Loading label="Loading the league table…" />;
  if (error) return <ErrorNotice error={error} onRetry={reload} title="No table available" />;

  const standings = data?.standings ?? [];

  return (
    <section>
      <div className="section-head">
        <h2>{data.league.name}</h2>
        <span className="muted small">
          {data.cached ? 'from cache' : 'fresh'}
          {data.updatedAt ? ` · ${new Date(data.updatedAt).toLocaleTimeString()}` : ''}
        </span>
      </div>

      {standings.length === 0 ? (
        <p className="empty">This competition has no table yet.</p>
      ) : (
        <>
          <StandingsTable standings={standings} />
          <p className="muted small hint">Tap a team to see its last five results. Swipe the table sideways for goals and points.</p>
        </>
      )}
    </section>
  );
}
