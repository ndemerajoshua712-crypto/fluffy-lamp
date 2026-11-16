// One team: its last five results as coloured W/D/L badges.
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useApi } from '../useApi.js';
import FormBadges from '../components/FormBadges.jsx';
import { Loading, ErrorNotice } from '../components/States.jsx';

const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

// Keep the Wikipedia lead short on a phone; the link opens the full article.
function shorten(text = '', max = 300) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sentenceEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  return sentenceEnd > 120 ? `${cut.slice(0, sentenceEnd + 1)}` : `${cut.trimEnd()}…`;
}

// "Research the web" card: Wikipedia context plus recent headlines about the
// team, including injury/availability news the football API does not publish.
function WebResearch({ teamId, name }) {
  const path = name ? `/research/${teamId}?name=${encodeURIComponent(name)}` : null;
  const { data, loading, error } = useApi(path);

  if (!name) {
    return (
      <p className="muted small">
        Web research needs the team name in the link (open this team from the table).
      </p>
    );
  }

  return (
    <div className="card web-card">
      <h3 className="card-title">From the web</h3>

      {loading ? (
        <p className="muted small web-note">
          <span className="spinner spinner-small" aria-hidden="true" /> Researching Wikipedia and football news…
        </p>
      ) : null}

      {error ? (
        <p className="muted small web-note">Web research is unavailable right now: {error.message}</p>
      ) : null}

      {data ? (
        <div className="web-body">
          {data.availability.length > 0 ? (
            <div className="web-availability">
              <strong>Availability news</strong>
              <ul>
                {data.availability.map((item) => (
                  <li key={item.url}>
                    <a href={item.url} target="_blank" rel="noreferrer">
                      {item.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {data.wikipedia ? (
            <p className="web-extract">
              {shorten(data.wikipedia.extract)}{' '}
              <a href={data.wikipedia.url} target="_blank" rel="noreferrer">
                Read more on Wikipedia
              </a>
            </p>
          ) : null}

          {data.news.length > 0 ? (
            <ul className="web-news">
              {data.news.map((item) => (
                <li key={item.url}>
                  <a href={item.url} target="_blank" rel="noreferrer">
                    {item.title}
                  </a>
                  <span className="news-meta muted small">
                    {item.source}
                    {item.publishedAt ? ` · ${dateFormat.format(new Date(item.publishedAt))}` : ''}
                    {item.tag !== 'news' ? <span className="tag">{item.tag}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {data.notes.length > 0 ? (
            <ul className="web-notes">
              {data.notes.map((note) => (
                <li key={note} className="muted small">
                  {note}
                </li>
              ))}
            </ul>
          ) : null}

          <p className="muted small web-sources">
            Sources: {data.sources.join(', ')}
            {data.cached ? ' · cached 10 min' : ''}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export default function TeamPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  // The name is passed in the link so the heading is right before data loads.
  const nameFromLink = params.get('name');

  const { data, loading, error, reload } = useApi(`/team/${id}`);

  const title = data?.team?.name || nameFromLink || `Team #${id}`;

  return (
    <section>
      <Link className="back" to="/">
        ← Back to standings
      </Link>

      <div className="section-head">
        <h2>{title}</h2>
      </div>

      {loading ? <Loading label="Loading recent form…" /> : null}

      {error ? (
        <ErrorNotice error={error} onRetry={reload} title="Form unavailable" />
      ) : null}

      {data ? (
        <>
          <div className="card form-card">
            <h3 className="card-title">Last 5 results</h3>
            <FormBadges form={data.form} />
            <p className="muted small">
              {data.summary.wins} won · {data.summary.draws} drawn · {data.summary.losses} lost
            </p>
          </div>

          {data.results.length === 0 ? (
            <p className="empty">No finished matches found for this team in the last year.</p>
          ) : (
            <ul className="results">
              {data.results.map((result) => (
                <li key={result.matchId} className="result">
                  <span className={`badge badge-${result.outcome.toLowerCase()} badge-small`}>
                    <span aria-hidden="true">{result.outcome}</span>
                    <span className="sr-only">{result.outcome}</span>
                  </span>
                  <span className="result-opponent">
                    <span className="muted small">{result.home ? 'vs' : 'at'}</span>{' '}
                    {result.opponent ? (
                      <Link to={`/team/${result.opponent.id}?name=${encodeURIComponent(result.opponent.name)}`}>
                        {result.opponent.name}
                      </Link>
                    ) : (
                      'Unknown'
                    )}
                    <span className="muted small result-date">{dateFormat.format(new Date(result.utcDate))}</span>
                  </span>
                  <span className="result-score">
                    {result.teamScore} – {result.opponentScore}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}

      <WebResearch teamId={id} name={title} />
    </section>
  );
}
