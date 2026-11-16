// The league table. Wrapped in a scroller so it works on a narrow phone.
import { Link } from 'react-router-dom';

export default function StandingsTable({ standings }) {
  return (
    <div className="table-wrap">
      <table>
        <caption className="sr-only">League standings</caption>
        <thead>
          <tr>
            <th scope="col" className="num">
              #
            </th>
            <th scope="col" className="team">
              Team
            </th>
            <th scope="col" className="num">
              P
            </th>
            <th scope="col" className="num">
              W
            </th>
            <th scope="col" className="num">
              D
            </th>
            <th scope="col" className="num">
              L
            </th>
            <th scope="col" className="num">
              GD
            </th>
            <th scope="col" className="num">
              Pts
            </th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row) => (
            <tr key={row.team.id}>
              <td className="num">{row.position ?? '–'}</td>
              <td className="team">
                <Link className="team-link" to={`/team/${row.team.id}?name=${encodeURIComponent(row.team.name)}`}>
                  {row.team.name}
                </Link>
              </td>
              <td className="num">{row.played}</td>
              <td className="num">{row.won}</td>
              <td className="num">{row.drawn}</td>
              <td className="num">{row.lost}</td>
              <td className="num">
                {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
              </td>
              <td className="num pts">{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
