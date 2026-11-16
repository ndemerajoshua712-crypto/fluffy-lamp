// "Research the web" for a team, using only free, keyless public sources.
//
// Two things are fetched:
//   1. A short description from Wikipedia (club history/context).
//   2. Recent football headlines from public RSS feeds (BBC Sport, Sky Sports),
//      filtered to the team and tagged (injury news, transfers, previews...).
//
// This does not replace the form calculation (that comes from match results);
// it adds the off-pitch context the free football API does not publish, notably
// injury and availability headlines. Responses are cached in SQLite for the same
// 10 minutes as the API calls, so we do not hammer the publishers.
import { readCache, writeCache } from './cache.js';

const USER_AGENT = 'footy-stats/1.0 (local football stats app)';
const TIMEOUT_MS = 8000;
const MAX_NEWS = 6;

export const FEEDS = [
  { source: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml' },
  { source: 'Sky Sports', url: 'https://www.skysports.com/rss/12040' },
];

export const SOURCES = ['Wikipedia', ...FEEDS.map((feed) => feed.source)];

const wikipediaUrl = (name) =>
  'https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1' +
  `&redirects=1&format=json&titles=${encodeURIComponent(name)}`;

// --- pure helpers (easy to test) ----------------------------------------

/** Turn CDATA and the five XML entities back into readable text. */
export function decodeEntities(text = '') {
  return String(text)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/** Remove HTML tags and tidy whitespace. */
export function stripHtml(text = '') {
  // Unwrap CDATA *first*: feeds wrap titles in <![CDATA[...]]>, and removing
  // tags first would delete the title inside it as if it were a tag.
  const withoutCdata = String(text).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return decodeEntities(withoutCdata.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function tagContent(xml, name) {
  const match = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? match[1].trim() : '';
}

function toIsoDate(raw) {
  if (!raw) return null;
  const parsed = Date.parse(stripHtml(raw));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

/** Parse an RSS 2.0 document into simple article objects. */
export function parseRssItems(xml = '') {
  const items = [];
  const itemPattern = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemPattern.exec(xml)) !== null) {
    const body = match[1];
    const title = stripHtml(tagContent(body, 'title'));
    if (!title) continue;

    items.push({
      title,
      url: stripHtml(tagContent(body, 'link')) || stripHtml(tagContent(body, 'guid')),
      description: stripHtml(tagContent(body, 'description')).slice(0, 280),
      publishedAt: toIsoDate(tagContent(body, 'pubDate')),
    });
  }

  return items;
}

// Words that say nothing about which club a headline is about.
const SUFFIXES = /\b(fc|afc|cf|sc|ac|cd|fk|if|sk|bk|club|football)\b\.?/gi;
const STOPWORDS = new Set([
  'the', 'and', 'sport', 'football', 'club', 'united', 'city', 'real', 'sporting',
]);

/**
 * Ways a headline might name this team. "Brighton & Hove Albion FC" gives
 * "brighton & hove albion", "brighton", "hove", "albion".
 */
export function teamAliases(name = '') {
  const cleaned = String(name)
    .replace(SUFFIXES, ' ')
    .replace(/[^\p{L}\p{N}& ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const aliases = new Set();
  if (cleaned.length >= 4) aliases.add(cleaned.toLowerCase());

  for (const word of cleaned.split(' ')) {
    const lower = word.toLowerCase();
    // "Manchester United" would otherwise match every "United" headline,
    // so the generic club words are skipped as single-word aliases.
    if (lower.length >= 5 && !STOPWORDS.has(lower)) aliases.add(lower);
  }

  return [...aliases];
}

/**
 * BBC Sport addresses clubs with hyphenated slugs, e.g. "Manchester City FC"
 * becomes "manchester-city". Not every club has one (non-English clubs do not).
 */
export function clubSlug(name = '') {
  return String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/&/g, ' and ')
    .replace(/\b(fc|afc|cf|sc|ac)\b\.?/gi, ' ')
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}

/** The club-specific BBC Sport feed URL (may not exist for every team). */
export const bbcTeamFeedUrl = (name) =>
  `https://feeds.bbci.co.uk/sport/football/teams/${clubSlug(name)}/rss.xml`;

/** Does a headline/summary mention this team? */
export function matchesTeam(text = '', aliases = []) {
  const haystack = ` ${String(text).toLowerCase()} `;
  return aliases.some((alias) => haystack.includes(alias));
}

const HEADLINE_TAGS = [
  ['injury', /\b(injur\w*|hamstring|knee|ankle|groin|calf|thigh|fitness|ruled out|doubt|suspend\w*|banned|red card|out for|surgery)\b/i],
  ['transfer', /\b(sign|signs|signing|transfer|loan|contract|bid|move|deal)\b/i],
  ['manager', /\b(boss|manager|head coach|sack|appoint|interim|caretaker)\b/i],
  ['preview', /\b(preview|ahead of|face|clash|team news|line-?up|predicted)\b/i],
];

/** Label a headline so the UI can highlight injury/availability news. */
export function tagHeadline(text = '') {
  for (const [label, pattern] of HEADLINE_TAGS) {
    if (pattern.test(text)) return label;
  }
  return 'news';
}

/** Pull the first usable page out of a Wikipedia query response. */
export function pickWikipediaPage(payload) {
  const pages = payload?.query?.pages;
  if (!pages) return null;

  for (const page of Object.values(pages)) {
    if (page.missing !== undefined) continue;
    if (!page.extract) continue;

    return {
      title: page.title,
      extract: page.extract.replace(/\s+/g, ' ').trim(),
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    };
  }

  return null;
}

/**
 * Keep only headlines about this team, newest first, with tags.
 * Everything is derived from what the feeds actually returned.
 */
export function buildResearch({ teamName, wikipedia = null, articles = [], now = Date.now(), max = MAX_NEWS }) {
  const aliases = teamAliases(teamName);
  const seen = new Set();
  const relevant = [];

  for (const article of articles) {
    if (!article?.title || !article?.url) continue;
    const text = `${article.title} ${article.description ?? ''}`;
    if (!matchesTeam(text, aliases)) continue;
    if (seen.has(article.title)) continue;
    seen.add(article.title);

    relevant.push({
      title: article.title,
      url: article.url,
      source: article.source ?? null,
      publishedAt: article.publishedAt ?? null,
      // Tag from the headline only: summaries often mention unrelated words
      // like "deal" or "move" and would mislabel the story.
      tag: tagHeadline(article.title),
    });
  }

  relevant.sort((a, b) => String(b.publishedAt ?? '').localeCompare(String(a.publishedAt ?? '')));
  const news = relevant.slice(0, max);

  return {
    team: { name: teamName },
    wikipedia,
    news,
    availability: news.filter((item) => item.tag === 'injury'),
    fetchedAt: new Date(now).toISOString(),
  };
}

// --- network ------------------------------------------------------------

async function fetchText(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json, application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

/**
 * Build a researcher bound to the cache database.
 * `fetchImpl` and `now` are injectable so tests never touch the network.
 */
export function createResearcher({ db, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  async function cachedText(url) {
    const hit = readCache(db, url, now());
    if (hit) return { text: hit.data.text, cached: true };

    const text = await fetchText(url, fetchImpl);
    writeCache(db, url, { text }, now());
    return { text, cached: false };
  }

  async function research(teamName) {
    const notes = [];
    let wikipedia = null;
    let allCached = true;
    const articles = [];

    // 1. Wikipedia summary.
    try {
      const { text, cached } = await cachedText(wikipediaUrl(teamName));
      allCached = allCached && cached;
      wikipedia = pickWikipediaPage(JSON.parse(text));
      if (!wikipedia) notes.push(`No Wikipedia article was found for "${teamName}".`);
    } catch (error) {
      allCached = false;
      notes.push(`Wikipedia could not be read: ${error.message}`);
    }

    // 2a. BBC Sport's per-club feed, when the club has one. This is the most
    // reliable source for a specific team, but plenty of clubs have no feed.
    try {
      const { text, cached } = await cachedText(bbcTeamFeedUrl(teamName));
      allCached = allCached && cached;
      for (const item of parseRssItems(text)) articles.push({ ...item, source: 'BBC Sport' });
    } catch {
      // No club page for this team (or it is down): the general feeds below
      // still get filtered to the team, so nothing is lost for English clubs
      // and non-English clubs simply get fewer headlines.
    }

    // 2b. General football feeds, filtered to this team.
    for (const feed of FEEDS) {
      try {
        const { text, cached } = await cachedText(feed.url);
        allCached = allCached && cached;
        for (const item of parseRssItems(text)) articles.push({ ...item, source: feed.source });
      } catch (error) {
        allCached = false;
        notes.push(`${feed.source} could not be read: ${error.message}`);
      }
    }

    const result = buildResearch({ teamName, wikipedia, articles, now: now() });
    if (result.news.length === 0 && notes.length === 0) {
      notes.push('None of the current headlines mention this team.');
    }

    return { ...result, cached: allCached, notes };
  }

  return { research };
}
