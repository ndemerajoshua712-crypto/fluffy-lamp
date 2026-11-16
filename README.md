# Footy Stats

A small football stats app: league tables, fixtures with scores, and the last
five results for any team as coloured **W/D/L** badges.

- **Backend:** Node.js + Express, SQLite via `better-sqlite3`
- **Frontend:** Vite + React, mobile-first, light and dark mode
- **Data:** [football-data.org](https://www.football-data.org/) v4 API (free plan)

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Add your free API key**

   Register at <https://www.football-data.org/client/register> (free) and copy
   the key from your account page. Then:

   ```bash
   cp .env.example .env
   ```

   Open `.env` and replace the placeholder:

   ```env
   FOOTBALL_API_KEY=your-real-key-here
   ```

   `.env` is git-ignored, so the key never ends up in the repository. The server
   only reads it from the environment — it is never sent to the browser.

3. **Run it** — two terminals:

   ```bash
   npm run dev:api      # Express API on http://localhost:3001
   ```

   ```bash
   npm run dev:client   # Vite dev server on http://localhost:3000
   ```

   Open <http://localhost:3000>. Vite proxies `/api` to the Express server, so
   there is no CORS setup and no key in the frontend.

## Production build

```bash
npm run build        # builds the client into dist/
npm start            # Express serves the API and dist/ on port 3001
```

Then open <http://localhost:3001>. Set `PORT` in `.env` to change the port.

## Tests

```bash
npm test
```

Covers the W/D/L form calculation, the 10-minute cache (fresh, expired, refresh),
the rate limiter, the readable errors for a missing key and a 429 response, and
the prediction model (Poisson maths, goal rates, small-sample fallbacks).

## API routes

| Route | What it returns |
| --- | --- |
| `GET /api/leagues` | Fixed list of free-plan competitions (PL, PD, SA, BL1, FL1, DED, PPL, BSA, CL) |
| `GET /api/standings/:league` | The league table for a competition code |
| `GET /api/fixtures/:league` | `upcoming` and `recent` matches for a two/three-week window |
| `GET /api/team/:id` | `form` (last 5 as `W`/`D`/`L`), each result and a W/D/L summary |
| `GET /api/prediction/:homeId/:awayId` | Expected goals, win/draw/loss chances, likely scorelines, both teams' form and rank |
| `GET /api/research/:teamId?name=Arsenal%20FC` | Online research: Wikipedia summary plus recent headlines, with injury news flagged |
| `GET /api/health` | `{ ok, hasApiKey }` — used to warn when the key is missing |

Errors come back as `{ error, message }` with a matching status, where `error` is
a short code such as `missing_api_key`, `rate_limited` or `unknown_league`.

## Match predictor

The **Predict** tab estimates a meeting between two teams. It is an estimate,
not a forecast guarantee, and it only uses data the free plan returns:

1. Each team's goals scored/conceded over its last 10 finished matches (using
   home/away form when there are 3+ matches on that side).
2. The league average from the standings (goals per team per match).
3. Attack and defence ratios against that average, shrunk towards the average
   when a sample is small, plus a small home advantage.
4. Two Poisson distributions from the resulting expected-goal values, giving
   win/draw/loss percentages, over/under 2.5 goals, both-teams-to-score and the
   three most likely scorelines.

It also shows each team's table position and last-five form. `GET /api/prediction/:homeId/:awayId`
returns all of it as JSON.

### What it deliberately does not estimate

football-data.org's free plan provides scores, fixtures and tables only. Cards
and bookings are paid tiers, corner counts are a separate paid statistics
add-on, and injuries/suspensions are not published at all. So the predictor
shows **corners**, **cards** and **injuries** as unavailable, with the reason,
instead of inventing figures. If you move to a paid plan that returns
`bookings`, the cards line fills in automatically (the model averages the
bookings arrays it receives).

## Online research for a team

A team page also has a **From the web** card. It uses two free, public, keyless
sources (no paid plan, no API key):

- **Wikipedia** (`en.wikipedia.org` API) — a short club description.
- **BBC Sport** and **Sky Sports** football RSS feeds — recent headlines,
  filtered to the team and tagged `injury`, `transfer`, `manager` or `preview`.
  Headlines tagged `injury` are highlighted as availability news, which is the
  one part of "team form" the football API does not publish.

Everything is fetched server-side, cached in SQLite for 10 minutes (the shared
`cache` table) and labelled with its sources. The W/D/L form itself always comes
from match results, not from news, so the stats stay authoritative.

If a feed is unreachable the card shows that source's failure instead of an
empty box, and the rest of the page keeps working.

## How caching and rate limits work

Every response is stored in the SQLite `cache` table keyed by its full URL and
reused for **10 minutes** (`server/cache.js`). That keeps us far below the free
plan's **10 requests per minute**.

`server/api.js` also keeps a sliding-window limiter in memory: the 11th request
inside a minute fails immediately with a clear message instead of being sent.
If football-data.org itself answers `429`, its reset time is passed to the
client so the UI can say how long to wait.

## Project layout

```
server/
  index.js      Express app, error handling, serves dist/ in production
  db.js         SQLite setup: standings, matches and cache tables
  api.js        football-data.org client, rate limiter, error handling
  cache.js      10-minute SQLite cache
  form.js       W/D/L form calculation (pure functions)
  predict.js    Expected goals, Poisson outcome model, data-gap notes
  research.js   Wikipedia + RSS news research, parsing and tagging
  leagues.js    The fixed league list
  routes.js     API routes
  *.test.js     node:test suites
client/
  src/
    App.jsx     App shell, routing, league picker, theme toggle
    pages/      Standings, Fixtures, Predict, Team
    components/ Table, fixture list, badges, loading/error states
    styles.css  Mobile-first light/dark styles
```

## Notes

- The free plan covers a limited set of competitions; the list lives in
  `server/leagues.js`.
- A team's last five results are computed from its finished matches in the last
  400 days, newest first.
- The SQLite file is created automatically at `server/data/football.db` and is
  git-ignored.
