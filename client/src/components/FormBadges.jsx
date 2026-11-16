// Coloured W / D / L badges used on the team page.

const LABELS = { W: 'Won', D: 'Drew', L: 'Lost' };

/** `form` is a list of letters, newest first. */
export default function FormBadges({ form }) {
  if (!form || form.length === 0) {
    return <p className="empty">No recent results yet.</p>;
  }

  return (
    <ul className="badges" aria-label="Last five results, most recent first">
      {form.map((letter, index) => (
        <li
          key={`${letter}-${index}`}
          className={`badge badge-${letter.toLowerCase()}`}
          title={`${LABELS[letter] ?? letter}${index === 0 ? ' (most recent)' : ''}`}
        >
          <span aria-hidden="true">{letter}</span>
          <span className="sr-only">{LABELS[letter] ?? letter}</span>
        </li>
      ))}
    </ul>
  );
}
