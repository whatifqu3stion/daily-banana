import type { GenerateContentParameters, GenerateContentResponse, GoogleGenAI } from '@google/genai';

// Only a tab ID and connection status remain in browser memory, never a key.
const tab = crypto.randomUUID();
let connected = false;
let expiresAt = 0;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
let revision = 0;
let activeRequests = 0;
let checkingKey = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());
export const subscribeGeminiConnection = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const hasGeminiKey = () => connected && Date.now() < expiresAt;
export const isGeminiBusy = () => activeRequests > 0;
export const getConnectionRevision = () => revision;

function clearConnection() {
  connected = false;
  expiresAt = 0;
  clearTimeout(expiryTimer);
  revision++;
  notify();
}

async function backend<T>(endpoint: string, body?: unknown, method = 'POST', signal?: AbortSignal): Promise<T> {
  const operation = endpoint === 'interactions' ? 'image' : endpoint === 'content' ? 'text' : 'key-check';
  let response: Response;
  try {
    response = await fetch(`/api/gemini/${endpoint}`, {
      method, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Gemini-Tab': tab },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store', signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(JSON.stringify({ error: { code: 502, kind: 'APP_NETWORK_ERROR', operation,
      message: 'Your browser could not reach the app server. Check your connection before trying again. The request outcome is unknown.' } }));
  }
  let value: any;
  try { value = await response.json(); }
  catch { throw new Error(JSON.stringify({ error: { code: response.ok ? 502 : response.status, kind: 'APP_RESPONSE_INVALID', operation,
    message: `The app server or hosting proxy returned an unreadable response (HTTP ${response.status}). Check that the app backend is running; this can also be a hosting or proxy failure, not a Google key problem.` } })); }
  if (!response.ok) {
    if (response.status === 401 && endpoint !== 'connect') clearConnection();
    const detail = value?.error;
    if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
      throw new Error(JSON.stringify({ error: { code: response.status, kind: 'APP_RESPONSE_INVALID', operation,
        message: `The app server or hosting proxy returned an unexpected error response (HTTP ${response.status}). No usable explanation was provided.` } }));
    }
    // Forward only the backend's public diagnostic contract, never arbitrary
    // JSON bodies, headers or other fields returned by a proxy.
    throw new Error(JSON.stringify({ error: {
      code: detail.code || response.status,
      ...(typeof detail.status === 'string' ? { status: detail.status } : {}),
      ...(typeof detail.kind === 'string' ? { kind: detail.kind } : {}),
      operation,
      ...(typeof detail.message === 'string' ? { message: detail.message.slice(0, 1500) } : {}),
    } }));
  }
  return value;
}

export async function connectGeminiKey(input: string): Promise<void> {
  if (isGeminiBusy()) throw new Error('Wait for the current AI request to finish before changing your key.');
  let candidateKey = input.trim();
  if (!candidateKey) throw new Error('Enter your Google Gemini API key.');
  checkingKey = true;
  activeRequests++;
  notify();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const result = await backend<{ expiresAt: number }>('connect', { key: candidateKey }, 'POST', controller.signal);
    connected = true;
    expiresAt = result.expiresAt;
    revision++;
    clearTimeout(expiryTimer);
    expiryTimer = setTimeout(clearConnection, Math.max(0, expiresAt - Date.now()));
  } catch (error) {
    if (controller.signal.aborted) throw new Error(JSON.stringify({ error: { code: 504, kind: 'KEY_CHECK_TIMEOUT' } }));
    throw error;
  } finally {
    clearTimeout(timeout);
    candidateKey = '';
    checkingKey = false;
    activeRequests--;
    notify();
  }
}

export function disconnectGeminiKey(): Promise<void> {
  if (isGeminiBusy()) throw new Error('Wait for the current AI request to finish before removing your key.');
  activeRequests++;
  notify();
  return backend('session', undefined, 'DELETE').then(() => clearConnection()).finally(() => {
    activeRequests--;
    notify();
  });
}

async function withConnection<T>(endpoint: string, params: unknown, signal?: AbortSignal): Promise<T> {
  if (checkingKey) throw new Error('Wait for the Google key check to finish before generating content.');
  if (!hasGeminiKey()) {
    if (connected) clearConnection();
    throw new Error('Connect your Google API key in API settings before using AI. Image generation requires paid API access.');
  }
  activeRequests++;
  notify();
  try { return await backend<T>(endpoint, params, 'POST', signal); }
  finally { activeRequests--; notify(); }
}

export function generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse> {
  const { abortSignal, ...config } = params.config || {};
  return withConnection('content', { ...params, config }, abortSignal);
}

export type ImageInteractionInput =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mime_type: string };

export interface ImageInteractionParameters {
  model: string;
  input: ImageInteractionInput[];
  response_format: {
    type: 'image';
    mime_type: 'image/jpeg';
    aspect_ratio: string;
    image_size?: '2K';
  };
}

type ImageInteraction = Exclude<Awaited<ReturnType<GoogleGenAI['interactions']['create']>>, AsyncIterable<unknown>>;
export function createImageInteraction(params: ImageInteractionParameters): Promise<ImageInteraction> {
  return withConnection('interactions', params);
}

// Best-effort immediate revocation on refresh/close; the hard server TTL is
// authoritative when the browser cannot deliver this request.
window.addEventListener('pagehide', () => {
  if (connected) {
    void fetch('/api/gemini/session', {
      method: 'DELETE', credentials: 'same-origin', keepalive: true,
      headers: { 'X-Gemini-Tab': tab },
    }).catch(() => {});
    clearConnection();
  }
});
