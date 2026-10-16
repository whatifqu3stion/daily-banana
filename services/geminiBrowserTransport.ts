import type { GoogleGenAI, GenerateContentParameters } from '@google/genai';
import { generationFailure, GenerationResponseError } from '../shared/generation-errors.mjs';
import { newsParams, NEWS_TIMEOUT_MS } from '../shared/news-request.mjs';
import { newsError, NewsRequestError } from '../shared/news-errors.mjs';
import { parseGroundedNews } from '../shared/news-parsing.mjs';

// Pages has no app server. Visitors supply their own key at runtime; never
// compile a publisher key or persist a visitor key in browser storage.
let client: GoogleGenAI | null = null;
let key = '';
export function clearBrowserGemini() { client = null; key = ''; }

function providerDetail(error: any): any {
  for (const value of [error?.error, error?.body, error?.message]) {
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value.replace(/^\d{3}\s+/, '')) : value;
      if (parsed && typeof parsed === 'object') return parsed.error || parsed;
    } catch { /* Never forward an arbitrary SDK message, URL or headers. */ }
  }
  return {};
}

function publicError(error: unknown, operation: string, secret: string): Error {
  const parsed = providerDetail(error);
  const failure = generationFailure(error, parsed, operation);
  if (operation === 'key-check') {
    const reason = parsed.details?.find?.((item: any) => item?.reason)?.reason;
    if (reason === 'API_KEY_HTTP_REFERRER_BLOCKED') failure.kind = 'KEY_WEBSITE_RESTRICTED';
    else if (reason === 'API_KEY_INVALID' || failure.code === 401) failure.kind = 'KEY_INVALID';
    else if (['SERVICE_DISABLED', 'API_KEY_SERVICE_BLOCKED'].includes(reason)) failure.kind = 'KEY_SERVICE_DISABLED';
    else if (failure.code === 429) failure.kind = 'KEY_QUOTA';
    else if (failure.kind === 'GENERATION_TIMEOUT' || failure.kind === 'GENERATION_CANCELLED') failure.kind = 'KEY_CHECK_TIMEOUT';
    else if (failure.kind === 'GENERATION_NETWORK') failure.kind = 'KEY_CHECK_NETWORK';
  }
  failure.message = failure.message.replace('The app server', 'Your browser');
  let safe = JSON.stringify({ error: failure });
  for (const value of [secret, encodeURIComponent(secret)]) if (value) safe = safe.split(value).join('[redacted]');
  return new Error(safe.replace(/AIza[A-Za-z0-9_-]{20,}/g, '[redacted]'));
}

export async function browserGeminiRequest<T>(endpoint: string, body: any, signal?: AbortSignal): Promise<T> {
  const operation = endpoint === 'interactions' ? 'image' : endpoint === 'content' ? 'text' : endpoint === 'news' ? 'news' : 'key-check';
  const secret = endpoint === 'connect' ? body?.key || '' : key;
  try {
    if (endpoint === 'connect') {
      const { GoogleGenAI } = await import('@google/genai');
      const candidate = new GoogleGenAI({ apiKey: secret, httpOptions: { timeout: 180_000, retryOptions: { attempts: 1 } } });
      // Metadata only. A successful check is not a promise of image access.
      await candidate.models.list({ config: { pageSize: 1, abortSignal: signal,
        httpOptions: { timeout: 15_000, retryOptions: { attempts: 1 } } } });
      signal?.throwIfAborted();
      client = candidate;
      key = secret;
      return { expiresAt: Date.now() + 30 * 60 * 1000 } as T;
    }
    if (endpoint === 'session') { clearBrowserGemini(); return { connected: false } as T; }
    const current = client;
    if (!current) throw new Error('Connect your Google key before generating.');
    if (endpoint === 'content') {
      return await current.models.generateContent({ ...body, config: { ...body.config, abortSignal: signal,
        httpOptions: { timeout: 180_000, retryOptions: { attempts: 1 } } } }) as T;
    }
    if (endpoint === 'news') {
      const deadline = AbortSignal.timeout(NEWS_TIMEOUT_MS);
      const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
      try {
        const result = await current.models.generateContent(newsParams(Date.now(), combined, NEWS_TIMEOUT_MS) as GenerateContentParameters);
        combined.throwIfAborted();
        return { ...parseGroundedNews(result), fetchedAt: Date.now() } as T;
      } catch (error) {
        // The SDK replaces the deadline signal's TimeoutError with AbortError.
        // Its own HTTP timer can also win the race. Only the caller's signal
        // means the creator closed the lookup; an internal abort is a timeout.
        const failure = generationFailure(error, providerDetail(error), 'news');
        if (!signal?.aborted && (deadline.aborted || failure.kind === 'GENERATION_CANCELLED')) {
          throw newsError('timeout', 'News search took too long',
            `The news search reached the app's ${NEWS_TIMEOUT_MS / 1000}-second waiting limit. No automatic retry was made. Try again, or continue with your own topic. A request already sent to Google may still incur usage charges.`);
        }
        throw error;
      }
    }
    if (endpoint === 'interactions') {
      const result = await current.interactions.create({ ...body, store: false, stream: false },
        { maxRetries: 0, timeout: 180_000, signal: AbortSignal.timeout(180_000) });
      if (!result || typeof result !== 'object' || (result.steps !== undefined && !Array.isArray(result.steps))) {
        throw new GenerationResponseError('GENERATION_RESPONSE_INVALID', 'Google returned an unreadable image response.');
      }
      for (const step of result.steps || []) {
        if (!step || typeof step !== 'object') throw new GenerationResponseError('GENERATION_RESPONSE_INVALID', 'Google returned an unreadable image step.');
        if (step.type === 'model_output' && step.error) throw new Error(JSON.stringify({ error: step.error }));
      }
      if (result.status !== 'completed') throw new GenerationResponseError('GENERATION_INCOMPLETE',
        'Google did not return a completed image. Its final outcome and Google usage may be unknown.');
      return result as T;
    }
    throw new Error('Unknown Gemini operation.');
  } catch (error) {
    if (error instanceof NewsRequestError) throw error;
    throw publicError(error, operation, secret);
  }
}
