// Fixtures grouped by day, with scores for finished matches.
import { Link } from 'react-router-dom';

const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

// Group matches into [{ label: 'Sat 8 Nov', matches: [...] }] keeping order.
function groupByDay(matches) {
  const groups = [];
  for (const match of matches) {
    const date = new Date(match.utcDate);
    const key = date.toDateString();
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.matches.push(match);
    else groups.push({ key, label: dayFormat.format(date), matches: [match] });
  }
  return groups;
}

function TeamLink({ team }) {
  if (!team) return <span className="team-name">TBC</span>;
  return (
    <Link className="team-name" to={`/team/${team.id}?name=${encodeURIComponent(team.name)}`}>
      {team.name}
    </Link>
  );
}

function FixtureRow({ match }) {
  const isLive = match.status === 'IN_PLAY' || match.status === 'PAUSED';

  return (
    <li className="fixture">
      <TeamLink team={match.homeTeam} />
      <span className={isLive ? 'score score-live' : 'score'}>
        {match.score ? `${match.score.home} – ${match.score.away}` : timeFormat.format(new Date(match.utcDate))}
      </span>
      <TeamLink team={match.awayTeam} />
      <span className="fixture-tag">
        {match.score ? 'FT' : isLive ? 'Live' : match.status === 'POSTPONED' ? 'PP' : ''}
      </span>
    </li>
  );
}

export default function FixtureList({ matches, emptyText }) {
  if (!matches || matches.length === 0) {
    return <p className="empty">{emptyText}</p>;
  }

  return (
    <div className="fixture-groups">
      {groupByDay(matches).map((group) => (
        <section key={group.key} className="card">
          <h3 className="card-title">{group.label}</h3>
          <ul className="fixtures">
            {group.matches.map((match) => (
              <FixtureRow key={match.id} match={match} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
