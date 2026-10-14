// Public failure categories deliberately exclude raw SDK messages, causes,
// headers and response bodies. Only structured Google message fields survive.
export class GenerationResponseError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

const RPC_HTTP_CODES = { 3: 400, 5: 404, 7: 403, 8: 429, 13: 500, 14: 503, 16: 401 };
const HTTP_STATUSES = { 400: 'INVALID_ARGUMENT', 401: 'UNAUTHENTICATED', 403: 'PERMISSION_DENIED', 404: 'NOT_FOUND', 429: 'RESOURCE_EXHAUSTED', 500: 'INTERNAL', 502: 'BAD_GATEWAY', 503: 'UNAVAILABLE', 504: 'DEADLINE_EXCEEDED' };

function safeProviderMessage(value) {
  if (typeof value !== 'string') return '';
  const message = value.trim();
  // Don't present serialized bodies or HTML proxy pages as explanations.
  if (/^[{[<]/.test(message)) return '';
  return message.replace(/https?:\/\/\S+/gi, '[provider URL omitted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/(?:cookie|authorization|x-goog-api-key|set-cookie)\s*[:=][^\r\n]*/gi, '[private header omitted]')
    .slice(0, 1500);
}

export function generationFailure(error, parsed, operation) {
  if (error instanceof GenerationResponseError) {
    return { code: 502, status: 'INVALID_PROVIDER_RESPONSE', kind: error.kind, operation, message: error.message };
  }
  const providerCode = Number(parsed?.code);
  const httpCode = [error?.status, error?.statusCode].map(Number).find(code => code >= 400 && code <= 599);
  const code = (providerCode >= 400 && providerCode <= 599 ? providerCode : RPC_HTTP_CODES[providerCode]) || httpCode;
  const chain = [];
  let current = error;
  for (let i = 0; current && i < 4; i++, current = current.cause) chain.push(current);
  const names = chain.map(item => `${item.name || ''} ${item.constructor?.name || ''}`).join(' ');
  const messages = chain.map(item => typeof item.message === 'string' ? item.message : '').join(' ');
  const codes = chain.map(item => item.code);
  // SDKs wrap connection/timeout causes differently. Inspect only for
  // classification; never send those messages or cause objects to the browser.
  if (code === 504 || /TimeoutError|RequestTimeoutError/.test(names) ||
      codes.some(value => ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT'].includes(value)) ||
      (!code && /timed?\s*out|timeout|DEADLINE_EXCEEDED/i.test(messages))) {
    return { code: 504, status: 'DEADLINE_EXCEEDED', kind: 'GENERATION_TIMEOUT', operation,
      message: 'The request did not finish before its time limit. Its final outcome is unknown; it may still count toward Google usage.' };
  }
  if (!code && /AbortError|APIUserAbortError|RequestAbortedError/.test(names)) {
    return { code: 408, status: 'CANCELLED', kind: 'GENERATION_CANCELLED', operation,
      message: 'The request was cancelled before the app received a result. Its final outcome and Google usage are unknown.' };
  }
  if (!code && (/APIConnectionError|ConnectionError/.test(names) ||
      codes.some(value => ['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'UND_ERR_SOCKET'].includes(value)) ||
      /fetch failed|network error|connection error/i.test(messages))) {
    return { code: 502, status: 'CONNECTION_FAILED', kind: 'GENERATION_NETWORK', operation,
      message: 'The app server could not complete its connection to Google. This does not establish that your key or topic is invalid. The request may still count toward Google usage.' };
  }
  if (code) {
    const providerStatus = typeof parsed?.status === 'string' && /^[A-Z][A-Z_]{0,63}$/.test(parsed.status) ? parsed.status : undefined;
    return { code, status: providerStatus || HTTP_STATUSES[code] || 'PROVIDER_ERROR',
      kind: 'GOOGLE_UPSTREAM_ERROR', operation,
      message: safeProviderMessage(parsed?.message) || `Google returned HTTP ${code} without a usable explanation.` };
  }
  return { code: 502, status: 'UNCLASSIFIED_FAILURE', kind: 'GENERATION_UNKNOWN', operation,
    message: 'The app could not interpret the generation failure. The cause is not yet known; this is not evidence of an invalid key, a billing problem, or a topic problem.' };
}
