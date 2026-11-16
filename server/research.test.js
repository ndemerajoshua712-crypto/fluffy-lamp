// Tests for the web-research helpers (no network is used).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRssItems,
  teamAliases,
  matchesTeam,
  tagHeadline,
  pickWikipediaPage,
  buildResearch,
  stripHtml,
  decodeEntities,
  clubSlug,
  bbcTeamFeedUrl,
} from './research.js';

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>BBC Sport</title>
  <item>
    <title><![CDATA[Arsenal hit four to go top]]></title>
    <link>https://www.bbc.co.uk/sport/football/1</link>
    <description><![CDATA[<p>Arsenal were <b>ruthless</b> at home.</p>]]></description>
    <pubDate>Sun, 08 Nov 2026 10:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Arsenal sweat on Saka &amp; Rice fitness</title>
    <link>https://www.bbc.co.uk/sport/football/2</link>
    <description></description>
    <pubDate>Sat, 07 Nov 2026 18:30:00 GMT</pubDate>
  </item>
</channel></rss>`;

test('parseRssItems reads titles, links, dates and strips markup', () => {
  const items = parseRssItems(SAMPLE_RSS);
  assert.equal(items.length, 2);

  assert.equal(items[0].title, 'Arsenal hit four to go top'); // CDATA unwrapped
  assert.equal(items[0].url, 'https://www.bbc.co.uk/sport/football/1');
  assert.equal(items[0].description, 'Arsenal were ruthless at home.');
  assert.equal(items[0].publishedAt, '2026-11-08T10:00:00.000Z');

  // Entities are decoded in plain titles too.
  assert.equal(items[1].title, 'Arsenal sweat on Saka & Rice fitness');
});

test('parseRssItems ignores broken items and tolerates empty input', () => {
  assert.deepEqual(parseRssItems(''), []);
  assert.deepEqual(parseRssItems('<rss><channel><item><link>x</link></item></channel></rss>'), []);
});

test('stripHtml and decodeEntities handle the usual escaping', () => {
  assert.equal(stripHtml('<p>Caf&eacute; &amp; co</p>'), 'Caf&eacute; & co');
  assert.equal(decodeEntities('&lt;tag&gt; &quot;q&quot; it&#39;s'), '<tag> "q" it\'s');
});

test('stripHtml keeps CDATA content instead of deleting it as a tag', () => {
  // This is the shape real BBC/Sky feeds use, and the bug that broke parsing.
  assert.equal(stripHtml('<![CDATA[Arsenal hit four to go top]]>'), 'Arsenal hit four to go top');
  assert.equal(
    stripHtml('<![CDATA[<p>Arsenal were <b>ruthless</b> &amp; clinical.</p>]]>'),
    'Arsenal were ruthless & clinical.'
  );
});

test('clubSlug builds the BBC club feed path', () => {
  assert.equal(clubSlug('Arsenal FC'), 'arsenal');
  assert.equal(clubSlug('Manchester City FC'), 'manchester-city');
  assert.equal(clubSlug('Brighton & Hove Albion FC'), 'brighton-and-hove-albion');
  assert.equal(clubSlug('Paris Saint-Germain FC'), 'paris-saint-germain');
  assert.equal(
    bbcTeamFeedUrl('Manchester City FC'),
    'https://feeds.bbci.co.uk/sport/football/teams/manchester-city/rss.xml'
  );
});

test('teamAliases drops generic club words but keeps distinctive ones', () => {
  const brighton = teamAliases('Brighton & Hove Albion FC');
  assert.ok(brighton.includes('brighton & hove albion'));
  assert.ok(brighton.includes('brighton'));
  assert.ok(brighton.includes('albion'));

  // "City" and "United" alone are too generic to match headlines.
  const city = teamAliases('Manchester City FC');
  assert.ok(city.includes('manchester'));
  assert.ok(!city.includes('city'));
});

test('matchesTeam finds a club inside a headline', () => {
  const aliases = teamAliases('Arsenal FC');
  assert.equal(matchesTeam('Arsenal hit four to go top', aliases), true);
  assert.equal(matchesTeam('Gunners celebrate: Arsenal win again', aliases), true);
  assert.equal(matchesTeam('Chelsea beat Tottenham', aliases), false);
});

test('tagHeadline flags injury, transfer and preview news', () => {
  assert.equal(tagHeadline('Saka ruled out for six weeks with hamstring injury'), 'injury');
  assert.equal(tagHeadline('Arsenal sign midfielder on loan'), 'transfer');
  assert.equal(tagHeadline('Manager faces pressure after defeat'), 'manager');
  assert.equal(tagHeadline('Arsenal vs Chelsea preview and team news'), 'preview');
  assert.equal(tagHeadline('Arsenal hit four to go top'), 'news');
});

test('pickWikipediaPage skips missing pages and builds a URL', () => {
  const payload = {
    query: {
      pages: {
        1: { title: 'Arsenal F.C.', extract: 'The Arsenal Football Club is a club in London.', fullurl: 'ignored' },
        2: { title: 'Nonexistent', missing: '' },
      },
    },
  };

  const page = pickWikipediaPage(payload);
  assert.equal(page.title, 'Arsenal F.C.');
  assert.match(page.extract, /London/);
  assert.equal(page.url, 'https://en.wikipedia.org/wiki/Arsenal_F.C.');
  assert.equal(pickWikipediaPage({}), null);
  assert.equal(pickWikipediaPage({ query: { pages: { 1: { title: 'X', missing: '' } } } }), null);
});

test('buildResearch filters to the team, dedupes, sorts and limits', () => {
  const articles = [
    { title: 'Arsenal win again', url: 'a', source: 'BBC Sport', publishedAt: '2026-11-01T10:00:00.000Z' },
    { title: 'Arsenal win again', url: 'a2', source: 'Sky Sports', publishedAt: '2026-11-01T10:00:00.000Z' },
    { title: 'Arsenal defender injured in training', url: 'b', source: 'Sky Sports', publishedAt: '2026-11-05T10:00:00.000Z' },
    { title: 'Chelsea appoint new coach', url: 'c', source: 'BBC Sport', publishedAt: '2026-11-06T10:00:00.000Z' },
    { title: 'No link', url: '', source: 'BBC Sport', publishedAt: null },
  ];

  const result = buildResearch({
    teamName: 'Arsenal FC',
    wikipedia: { title: 'Arsenal F.C.', extract: '...', url: 'https://en.wikipedia.org/wiki/Arsenal_F.C.' },
    articles,
    now: Date.parse('2026-11-08T00:00:00.000Z'),
  });

  assert.equal(result.news.length, 2); // duplicate removed, Chelsea dropped, no-link dropped
  assert.equal(result.news[0].title, 'Arsenal defender injured in training'); // newest first
  assert.equal(result.news[0].tag, 'injury');
  assert.equal(result.availability.length, 1);
  assert.equal(result.fetchedAt, '2026-11-08T00:00:00.000Z');
});

test('buildResearch caps the list and survives empty input', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({
    title: `Arsenal story ${i}`,
    url: `u${i}`,
    source: 'BBC Sport',
    publishedAt: `2026-11-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`,
  }));

  const capped = buildResearch({ teamName: 'Arsenal', articles: many, max: 4 });
  assert.equal(capped.news.length, 4);
  assert.equal(capped.wikipedia, null);

  const empty = buildResearch({ teamName: 'Arsenal', articles: [] });
  assert.deepEqual(empty.news, []);
  assert.deepEqual(empty.availability, []);
});
