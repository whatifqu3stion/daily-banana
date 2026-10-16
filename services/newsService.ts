import type { NewsFeed, NewsStory } from '../types';
import { IS_BROWSER_BYOK, collectNews, getConnectionRevision, hasGeminiKey, subscribeGeminiConnection } from './geminiConnection';
import { describeNewsError, newsError, NewsRequestError } from './newsErrors';
import { normalizeNewsStories } from './newsParsing';
import { NEWS_TIMEOUT_MS, NEWS_REQUEST_DEADLINE_MS } from '../shared/news-request.mjs';

const CACHE_KEY = 'dailyBanana_news_v3';
const FRESH_FOR = 30 * 60 * 1000;
const MAX_CACHED_AGE = 24 * 60 * 60 * 1000;
let inflight: { revision: number; controller: AbortController; promise: Promise<NewsFeed> } | null = null;
let cacheRevision = getConnectionRevision();
let cacheScope = crypto.randomUUID();

function readCache(maxAge: number): NewsFeed | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw || raw.length > 210_000) return null;
    const cached = JSON.parse(raw);
    const age = Date.now() - cached?.fetchedAt;
    if (cached?.version !== 3 || cached.scope !== cacheScope || !Number.isFinite(cached.fetchedAt) || age < 0 || age > maxAge || !Array.isArray(cached.stories)) return null;
    const stories = normalizeNewsStories(cached.stories);
    if (!stories.length || stories.length !== cached.stories.length) return null;
    return { stories, fetchedAt: cached.fetchedAt,
      searchSuggestions: typeof cached.searchSuggestions === 'string' && cached.searchSuggestions.length <= 100_000 ? cached.searchSuggestions : undefined };
  } catch { return null; }
}

function saveCache(feed: NewsFeed) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...feed, version: 3, scope: cacheScope })); }
  catch { /* Storage failure does not prevent using a valid live response. */ }
}

export function cancelNewsRequest() {
  inflight?.controller.abort();
  inflight = null;
}

// A replacement/removal/expiry cannot let an old response populate this tab.
subscribeGeminiConnection(() => {
  if (cacheRevision !== getConnectionRevision()) {
    cacheRevision = getConnectionRevision();
    cacheScope = crypto.randomUUID();
    cancelNewsRequest();
  }
});

export async function getNewsFeed({ forceRefresh = false }: { forceRefresh?: boolean } = {}): Promise<NewsFeed> {
  if (!hasGeminiKey()) throw new NewsRequestError(describeNewsError('Connect your Google API key before fetching headlines.'));
  const revision = getConnectionRevision();
  if (inflight?.revision === revision) return inflight.promise;
  if (!forceRefresh) {
    const cached = readCache(FRESH_FOR);
    if (cached) return cached;
  }
  const previous = readCache(MAX_CACHED_AGE);
  const controller = new AbortController();
  const started = performance.now();
  let outcome = 'error';
  let timedOut = false;
  const deadline = setTimeout(() => { timedOut = true; controller.abort(); }, NEWS_REQUEST_DEADLINE_MS);
  const promise = (async (): Promise<NewsFeed> => {
    try {
      const result = await collectNews(forceRefresh, controller.signal);
      if (controller.signal.aborted || revision !== getConnectionRevision()) throw newsError('cancelled', 'News search closed', 'The news lookup is no longer active.', null);
      const stories = normalizeNewsStories(result?.stories);
      if (!stories.length || !Number.isFinite(result?.fetchedAt) || !Array.isArray(result.stories) || stories.length !== result.stories.length) {
        throw newsError('format', 'The news desk returned unreadable headlines', 'The app returned an unexpected news feed. No headlines were saved.');
      }
      const feed: NewsFeed = { stories, fetchedAt: result.fetchedAt,
        searchSuggestions: typeof result.searchSuggestions === 'string' && result.searchSuggestions.length <= 100_000 ? result.searchSuggestions : undefined };
      saveCache(feed);
      outcome = 'success';
      return feed;
    } catch (error) {
      // Session expiry notification aborts the waiter as well. Report recovery
      // rather than silently treating that abort as closing the news dialog.
      if (!hasGeminiKey()) {
        outcome = 'key';
        throw new NewsRequestError(describeNewsError(JSON.stringify({ error: { code: 401 } })));
      }
      if (revision !== getConnectionRevision() || (controller.signal.aborted && !timedOut)) {
        outcome = 'cancelled';
        throw newsError('cancelled', 'News search closed', 'The news lookup was closed.', null);
      }
      const issue = timedOut
        ? newsError('transport-timeout', 'News search took too long',
          IS_BROWSER_BYOK ? `Google did not return headlines within the app's ${NEWS_REQUEST_DEADLINE_MS / 1000}-second overall waiting limit. No automatic retry was made; the Google request outcome and usage may be unknown.` : `The app did not deliver headlines within ${NEWS_REQUEST_DEADLINE_MS / 1000} seconds. This is the browser-to-app waiting limit, separate from the server’s ${NEWS_TIMEOUT_MS / 1000}-second Google limit. No automatic retry was made; the Google request outcome and usage may be unknown.`).issue
        : describeNewsError(error);
      outcome = issue.code;
      if (previous && !['key', 'cancelled'].includes(issue.code)) return { ...previous, stale: true, warning: issue };
      throw new NewsRequestError(issue);
    } finally {
      clearTimeout(deadline);
      if (inflight?.controller === controller) inflight = null;
      // Keep only the last lookup's duration and category. No credentials,
      // provider messages, story text or source URLs enter diagnostics.
      try {
        performance.clearMeasures('daily-banana:news-lookup');
        performance.measure('daily-banana:news-lookup', { start: started,
          detail: { outcome, transport: IS_BROWSER_BYOK ? 'browser' : 'server' } });
      } catch { /* Optional diagnostics must never prevent news or recovery. */ }
    }
  })();
  inflight = { revision, controller, promise };
  return promise;
}

export async function getTopStories(): Promise<NewsStory[]> {
  return (await getNewsFeed()).stories;
}
