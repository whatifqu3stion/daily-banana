import { parseGroundedNews } from '../shared/news-parsing.mjs';
import { SessionError } from './sessions.mjs';

export const NEWS_TIMEOUT_MS = 20_000;
const FRESH_FOR = 30 * 60 * 1000;

function newsParams(now, signal, timeout) {
  return {
    model: 'gemini-2.5-flash',
    contents: `Use Google Search to find up to 10 recent news headlines reported in the past 24 hours.
Current time (UTC): ${new Date(now).toISOString()}.
Focus on politics, government, business, science, technology, international affairs and cultural events.
Avoid sports scores, celebrity gossip and purely local crime. Prefer original reporting and identifiable publishers.
Only include claims supported by the search results. Do not invent events, statistics, quotes, sources or dates.
Return fewer than 10 if there are not enough usable, recent, distinct stories.
Return a JSON array, optionally in a JSON code fence, with these fields per story:
"title": a concise headline (at most 120 characters);
"description": 2-3 factual sentences (at most 500 characters), with a specific detail where supported;
"source_urls": URLs of actual search results supporting this story.
Do not include any unsourced story. Attribute each story's claims to its sources.`,
    config: { tools: [{ googleSearch: {} }], temperature: 0.1, abortSignal: signal,
      httpOptions: { timeout, retryOptions: { attempts: 1 } } },
  };
}

// Session-object keys are never shared between users, tabs, or key rotations.
// Bounds cap memory and concurrent upstream work without a database/service.
export class NewsService {
  constructor({ now = Date.now, timeoutMs = NEWS_TIMEOUT_MS, maxEntries = 128 } = {}) {
    this.now = now;
    this.timeoutMs = timeoutMs;
    this.maxEntries = maxEntries;
    this.entries = new Map();
  }
  valid(session) { return Boolean(session.key) && session.expiresAt > this.now(); }
  prune() {
    for (const [session, entry] of this.entries) {
      if (!this.valid(session) || (!entry.pending && (!entry.feed || this.now() - entry.feed.fetchedAt >= FRESH_FOR))) {
        entry.controller?.abort();
        this.entries.delete(session);
      }
    }
  }
  close() {
    for (const entry of this.entries.values()) entry.controller?.abort();
    this.entries.clear();
  }
  async get(session, { forceRefresh, signal }, generate) {
    this.prune();
    if (!this.valid(session)) throw new SessionError(401, 'Your API key session expired or was removed. Reconnect in API settings.');
    let entry = this.entries.get(session);
    // Cancellation must settle before starting another paid lookup.
    if (entry?.pending && entry.controller.signal.aborted) throw new SessionError(409, 'The previous news lookup is finishing cancellation. Try again shortly.');
    if (entry?.pending) return this.subscribe(entry, signal, 'shared');
    if (!forceRefresh && entry?.feed) return { feed: entry.feed, cache: 'hit', lookupMs: 0, parseMs: 0 };
    if (!entry) {
      if (this.entries.size >= this.maxEntries) {
        const idle = [...this.entries].find(([, candidate]) => !candidate.pending);
        if (idle) this.entries.delete(idle[0]);
        else throw new SessionError(503, 'The news desk is busy. Try again shortly; no new Google request was made.');
      }
      entry = { feed: null };
      this.entries.set(session, entry);
    }
    const controller = new AbortController();
    const timeout = Math.max(1, Math.min(this.timeoutMs, session.expiresAt - this.now()));
    const deadline = AbortSignal.timeout(timeout);
    const upstreamSignal = AbortSignal.any([controller.signal, deadline]);
    Object.assign(entry, { controller, pending: true, waiters: 0 });
    const target = entry;
    target.promise = (async () => {
      const started = performance.now();
      try {
        // generate owns the credential-session lock until upstream settles.
        const output = await generate(newsParams(this.now(), upstreamSignal, timeout));
        const lookupMs = performance.now() - started;
        if (upstreamSignal.aborted) throw upstreamSignal.reason;
        if (!this.valid(session)) throw new SessionError(401, 'Your API key session expired or was removed. Reconnect in API settings.');
        const parseStart = performance.now();
        const parsed = parseGroundedNews(output);
        target.feed = { ...parsed, fetchedAt: this.now() };
        return { feed: target.feed, lookupMs, parseMs: performance.now() - parseStart };
      } catch (error) {
        if (!this.valid(session)) throw new SessionError(401, 'Your API key session expired or was removed. Reconnect in API settings.');
        if (deadline.aborted && !controller.signal.aborted) throw deadline.reason;
        throw error;
      } finally {
        target.pending = false;
        if (!target.feed && this.entries.get(session) === target) this.entries.delete(session);
      }
    })();
    return this.subscribe(target, signal, 'miss');
  }
  subscribe(entry, signal, cache) {
    entry.waiters++;
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = (callback, value) => {
        if (finished) return;
        finished = true;
        signal.removeEventListener('abort', cancel);
        entry.waiters--;
        if (!entry.waiters && entry.pending) entry.controller.abort();
        callback(value);
      };
      const cancel = () => finish(reject, new DOMException('News lookup closed', 'AbortError'));
      entry.promise.then(value => finish(resolve, { ...value, cache }), error => finish(reject, error));
      if (signal.aborted) cancel();
      else signal.addEventListener('abort', cancel, { once: true });
    });
  }
}
