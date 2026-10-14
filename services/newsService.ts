import type { NewsFeed, NewsStory } from '../types';
import { generateContent, getConnectionRevision, hasGeminiKey } from './geminiConnection';
import { describeNewsError, isTransientNewsError, newsError, NewsRequestError } from './newsErrors';
import { normalizeNewsStories, parseGroundedNews } from './newsParsing';

const CACHE_KEY = 'dailyBanana_news_v2';
const FRESH_FOR = 30 * 60 * 1000;
const MAX_CACHED_AGE = 24 * 60 * 60 * 1000;
const REQUEST_DEADLINE = 30_000;

interface CachedFeed extends NewsFeed { version: 2 }
let inflight: { revision: number; controller: AbortController; promise: Promise<NewsFeed> } | null = null;

function readCache(maxAge: number): NewsFeed | null {
  try {
    const cached: CachedFeed = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    const age = Date.now() - cached?.fetchedAt;
    if (cached?.version !== 2 || !Number.isFinite(cached.fetchedAt) || age < 0 || age > maxAge) return null;
    const stories = normalizeNewsStories(cached.stories);
    if (!stories.length || stories.length !== cached.stories.length) return null;
    return {
      stories, fetchedAt: cached.fetchedAt,
      searchSuggestions: typeof cached.searchSuggestions === 'string' && cached.searchSuggestions.length <= 100_000
        ? cached.searchSuggestions : undefined,
    };
  } catch { return null; }
}

function saveCache(feed: NewsFeed) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...feed, version: 2 })); }
  catch { /* Storage failure does not prevent using a valid live response. */ }
}

export function cancelNewsRequest() {
  inflight?.controller.abort();
  inflight = null;
}

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
  let timedOut = false;
  const deadline = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_DEADLINE);
  const now = new Date();
  const prompt = `Use Google Search to find up to 10 recent news headlines reported in the past 24 hours.
Current time: ${now.toISOString()}. The reader's local date is ${now.toLocaleDateString('en-US')}.
Focus on politics, government, business, science, technology, international affairs and cultural events.
Avoid sports scores, celebrity gossip and purely local crime. Prefer original reporting and identifiable publishers.
Only include claims supported by the search results. Do not invent events, statistics, quotes, sources or dates.
Return fewer than 10 if there are not enough usable, recent, distinct stories.
Return a JSON array, optionally in a JSON code fence, with these fields per story:
"title": a concise headline (at most 120 characters);
"description": 2-3 factual sentences (at most 500 characters), with a specific detail where supported;
"source_urls": URLs of actual search results supporting this story.
Do not include any unsourced story. Attribute each story's claims to its sources.`;

  const promise = (async (): Promise<NewsFeed> => {
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (controller.signal.aborted || revision !== getConnectionRevision()) {
          throw newsError('cancelled', 'News search closed', 'The news lookup is no longer active.', null);
        }
        try {
          const result = await generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
              tools: [{ googleSearch: {} }],
              temperature: 0.1,
              abortSignal: controller.signal,
              // Explicit limits prevent hidden SDK retries on quota/billing errors.
              httpOptions: { timeout: 20_000, retryOptions: { attempts: 1 } },
            },
          });
          if (controller.signal.aborted || revision !== getConnectionRevision()) {
            throw newsError('cancelled', 'News search closed', 'The news lookup is no longer active.', null);
          }
          const parsed = parseGroundedNews(result);
          const feed: NewsFeed = { ...parsed, fetchedAt: Date.now() };
          saveCache(feed);
          return feed;
        } catch (error) {
          if (controller.signal.aborted || attempt === 1 || !isTransientNewsError(error)) throw error;
          await new Promise<void>(resolve => {
            const finish = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', finish); resolve(); };
            const timer = setTimeout(finish, 600);
            controller.signal.addEventListener('abort', finish, { once: true });
          });
        }
      }
      throw newsError('service', 'News search unavailable', 'Please try again.');
    } catch (error) {
      if (controller.signal.aborted && !timedOut) throw newsError('cancelled', 'News search closed', 'The news lookup was closed.', null);
      const issue = timedOut
        ? describeNewsError('News request timed out')
        : describeNewsError(error);
      if (previous && !['key', 'cancelled'].includes(issue.code)) {
        // A failed refresh must never masquerade as fresh current headlines.
        return { ...previous, stale: true, warning: issue };
      }
      throw new NewsRequestError(issue);
    } finally {
      clearTimeout(deadline);
      if (inflight?.controller === controller) inflight = null;
    }
  })();
  inflight = { revision, controller, promise };
  return promise;
}

// Preserve the existing service interface used by other callers.
export async function getTopStories(): Promise<NewsStory[]> {
  return (await getNewsFeed()).stories;
}
