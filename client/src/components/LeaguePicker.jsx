// Horizontal row of league chips. Scrolls sideways on a phone.
import { useApi } from '../useApi.js';
import { useLeague } from '../league-context.js';
import { Loading } from './States.jsx';

export default function LeaguePicker() {
  const { league, setLeague } = useLeague();
  const { data, loading, error, reload } = useApi('/leagues');

  if (loading) return <Loading label="Loading leagues…" />;

  if (error) {
    return (
      <div className="inline-error" role="alert">
        <span>Could not load the league list: {error.message}</span>
        <button type="button" className="button button-small" onClick={reload}>
          Retry
        </button>
      </div>
    );
  }

  const leagues = data?.leagues ?? [];

  return (
    <div className="picker" role="tablist" aria-label="Choose a league">
      {leagues.map((item) => (
        <button
          key={item.code}
          type="button"
          role="tab"
          aria-selected={item.code === league}
          className={item.code === league ? 'chip chip-active' : 'chip'}
          onClick={() => setLeague(item.code)}
          title={item.country}
        >
          {item.name}
        </button>
      ))}
    </div>
  );
}
