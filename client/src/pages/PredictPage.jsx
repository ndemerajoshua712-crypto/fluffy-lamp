// Match predictor: expected goals and outcome chances from recent results,
// plus a clear list of the stats this API cannot provide.
import { useEffect, useState } from 'react';
import { useApi } from '../useApi.js';
import { useLeague } from '../league-context.js';
import FormBadges from '../components/FormBadges.jsx';
import { Loading, ErrorNotice } from '../components/States.jsx';

function TeamPanel({ team, sided }) {
  return (
    <div className="team-panel">
      <div className="team-panel-head">
        <h3>{team.name}</h3>
        <span className="muted small">{sided}</span>
      </div>

      <p className="rank-line">
        {team.rank
          ? `#${team.rank.position} · ${team.rank.points} pts from ${team.rank.played}`
          : 'Not in the table yet'}
      </p>

      <FormBadges form={team.form} />

      <p className="muted small">
        {team.goalsForPerMatch ?? '–'} scored · {team.goalsAgainstPerMatch ?? '–'} conceded per match
        {team.sample ? ` (last ${team.sample})` : ' (no recent matches)'}
      </p>
    </div>
  );
}

function DataGaps({ gaps }) {
  return (
    <div className="card gap-card">
      <h3 className="card-title">What this API cannot tell us</h3>
      <ul className="gap-list">
        {gaps.map((gap) => (
          <li key={gap.label}>
            <div className="gap-head">
              <strong>{gap.label}</strong>
              {gap.available ? (
                <span className="tag tag-ok">about {gap.expectedTotal} expected</span>
              ) : (
                <span className="tag">unavailable</span>
              )}
            </div>
            <p className="muted small">{gap.reason}</p>
          </li>
        ))}
      </ul>
      <p className="muted small gap-footnote">
        These are left out on purpose — the app shows nothing rather than a made-up number.
      </p>
    </div>
  );
}

function PredictionResult({ data }) {
  const xg = data.prediction.expectedGoals;
  const best = data.prediction.likelyScores[0];

  return (
    <>
      <div className="card xg-card">
        <h3 className="card-title">Expected goals</h3>
        <div className="xg-row">
          <div className="xg-team">
            <span className="xg-name">{data.home.name}</span>
            <strong className="xg-value">{xg.home.toFixed(1)}</strong>
          </div>
          <div className="xg-total">
            <span className="muted small">total</span>
            <strong>{xg.total.toFixed(1)}</strong>
          </div>
          <div className="xg-team xg-team-away">
            <strong className="xg-value">{xg.away.toFixed(1)}</strong>
            <span className="xg-name">{data.away.name}</span>
          </div>
        </div>

        {best ? (
          <p className="xg-best">
            Most likely score: <strong>{best.home}–{best.away}</strong>{' '}
            <span className="muted small">({best.probability}% chance)</span>
          </p>
        ) : null}

        <dl className="xg-extras">
          <div>
            <dt>Over 2.5 goals</dt>
            <dd>{data.prediction.over25}%</dd>
          </div>
          <div>
            <dt>Both teams score</dt>
            <dd>{data.prediction.bothTeamsScore}%</dd>
          </div>
        </dl>
      </div>

      <div className="card prob-card">
        <h3 className="card-title">Match outcome</h3>
        <div
          className="prob-bar"
          role="img"
          aria-label={`${data.home.name} win ${data.prediction.homeWin}%, draw ${data.prediction.draw}%, ${data.away.name} win ${data.prediction.awayWin}%`}
        >
          <span className="prob-seg prob-home" style={{ width: `${data.prediction.homeWin}%` }} />
          <span className="prob-seg prob-draw" style={{ width: `${data.prediction.draw}%` }} />
          <span className="prob-seg prob-away" style={{ width: `${data.prediction.awayWin}%` }} />
        </div>
        <ul className="prob-legend">
          <li>
            <span className="dot dot-home" /> {data.home.name} {data.prediction.homeWin}%
          </li>
          <li>
            <span className="dot dot-draw" /> Draw {data.prediction.draw}%
          </li>
          <li>
            <span className="dot dot-away" /> {data.away.name} {data.prediction.awayWin}%
          </li>
        </ul>

        <h4 className="sub-heading">Likely scorelines</h4>
        <ul className="scorelines">
          {data.prediction.likelyScores.map((s) => (
            <li key={`${s.home}-${s.away}`}>
              <span className="scoreline">
                {s.home}–{s.away}
              </span>
              <span className="muted small">{s.probability}%</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="compare-grid">
        <TeamPanel team={data.home} sided="home" />
        <TeamPanel team={data.away} sided="away" />
      </div>

      <DataGaps gaps={[data.corners, data.cards, data.injuries]} />

      <ul className="notes">
        {data.notes.map((note) => (
          <li key={note} className="muted small">
            {note}
          </li>
        ))}
      </ul>
    </>
  );
}

export default function PredictPage() {
  const { league } = useLeague();
  const fixtures = useApi(`/fixtures/${league}`);
  const table = useApi(`/standings/${league}`);

  const [homeId, setHomeId] = useState('');
  const [awayId, setAwayId] = useState('');

  // A new league means new teams, so clear the picks.
  useEffect(() => {
    setHomeId('');
    setAwayId('');
  }, [league]);

  // Default to the league's next upcoming fixture.
  useEffect(() => {
    const next = fixtures.data?.upcoming?.[0];
    if (!next || homeId || awayId) return;
    if (next.homeTeam?.id && next.awayTeam?.id) {
      setHomeId(String(next.homeTeam.id));
      setAwayId(String(next.awayTeam.id));
    }
  }, [fixtures.data, homeId, awayId]);

  const teams = table.data?.standings?.map((row) => row.team) ?? [];
  const path =
    homeId && awayId && homeId !== awayId ? `/prediction/${homeId}/${awayId}` : null;
  const { data, loading, error, reload } = useApi(path);

  const swap = () => {
    setHomeId(awayId);
    setAwayId(homeId);
  };

  if (fixtures.loading || table.loading) return <Loading label="Loading teams…" />;
  if (fixtures.error || table.error) {
    const firstError = fixtures.error || table.error;
    return (
      <ErrorNotice
        error={firstError}
        onRetry={() => {
          fixtures.reload();
          table.reload();
        }}
        title="Predictor unavailable"
      />
    );
  }

  return (
    <section>
      <div className="section-head">
        <h2>Match predictor</h2>
        <span className="muted small">last 10 results + league table</span>
      </div>

      <div className="card predict-controls">
        <label className="field">
          <span className="field-label">Home team</span>
          <select value={homeId} onChange={(e) => setHomeId(e.target.value)}>
            <option value="">Choose a team</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="button button-small swap" onClick={swap} aria-label="Swap home and away teams">
          ⇄ Swap
        </button>

        <label className="field">
          <span className="field-label">Away team</span>
          <select value={awayId} onChange={(e) => setAwayId(e.target.value)}>
            <option value="">Choose a team</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {homeId && awayId && homeId === awayId ? (
        <p className="empty">Pick two different teams.</p>
      ) : null}

      {loading ? <Loading label="Working out the numbers…" /> : null}
      {error ? (
        <ErrorNotice error={error} onRetry={reload} title="Prediction unavailable" />
      ) : null}
      {data ? <PredictionResult data={data} /> : null}
    </section>
  );
}
