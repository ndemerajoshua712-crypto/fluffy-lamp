// Fixtures and recent results for the selected league.
import { useApi } from '../useApi.js';
import { useLeague } from '../league-context.js';
import FixtureList from '../components/FixtureList.jsx';
import { Loading, ErrorNotice } from '../components/States.jsx';

export default function FixturesPage() {
  const { league } = useLeague();
  const { data, loading, error, reload } = useApi(`/fixtures/${league}`);

  if (loading) return <Loading label="Loading fixtures…" />;
  if (error) return <ErrorNotice error={error} onRetry={reload} title="Fixtures unavailable" />;

  return (
    <section>
      <div className="section-head">
        <h2>{data.league.name}</h2>
        <span className="muted small">{data.cached ? 'from cache' : 'fresh'}</span>
      </div>

      <h3 className="group-heading">Upcoming</h3>
      <FixtureList matches={data.upcoming} emptyText="No upcoming matches in the next three weeks." />

      <h3 className="group-heading">Recent results</h3>
      <FixtureList matches={data.recent} emptyText="No results in the last two weeks." />
    </section>
  );
}
