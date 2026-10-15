import { GoogleGenAI } from '@google/genai';
import { CredentialSessions, SessionError, SESSION_TTL, TAB_PATTERN, cookieName } from './sessions.mjs';
import { generationFailure, GenerationResponseError } from './generation-errors.mjs';

const IMAGE_MODELS = new Set(['gemini-nano-banana-2.1', 'gemini-2.5-flash-image']);
const RPC_STATUSES = { 3: 'INVALID_ARGUMENT', 5: 'NOT_FOUND', 7: 'PERMISSION_DENIED', 8: 'RESOURCE_EXHAUSTED', 13: 'INTERNAL', 14: 'UNAVAILABLE', 16: 'UNAUTHENTICATED' };
const RPC_HTTP_CODES = { 3: 400, 5: 404, 7: 403, 8: 429, 13: 500, 14: 503, 16: 401 };
const HTTP_STATUSES = { 400: 'INVALID_ARGUMENT', 401: 'UNAUTHENTICATED', 403: 'PERMISSION_DENIED', 404: 'NOT_FOUND', 429: 'RESOURCE_EXHAUSTED', 500: 'INTERNAL', 503: 'UNAVAILABLE', 504: 'DEADLINE_EXCEEDED' };

// Models errors serialize JSON in message; Interactions errors carry the
// provider body in error/body and prefix message with an HTTP status.
function providerError(error) {
  for (const value of [error.error, error.body, error.message]) {
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value.replace(/^\d{3}\s+/, '')) : value;
      const detail = parsed?.error || parsed;
      if (detail && typeof detail === 'object' && !Array.isArray(detail) &&
          (typeof detail.message === 'string' || detail.code !== undefined)) return detail;
    } catch { /* Try the next SDK representation, without logging it. */ }
  }
  return {};
}

function keyCheckFailure(error, parsed, code) {
  const reason = Array.isArray(parsed?.details)
    ? parsed.details.find(detail => typeof detail?.reason === 'string')?.reason : undefined;
  const message = String(parsed?.message || error.message || '');
  const networkCode = error.cause?.code || error.code;
  if (reason === 'API_KEY_HTTP_REFERRER_BLOCKED') {
    return { kind: 'KEY_WEBSITE_RESTRICTED', message: 'Google blocked this website-restricted key. Use a Gemini API key configured for server-side use; keep the Gemini API service restriction.' };
  }
  if (reason === 'API_KEY_IP_ADDRESS_BLOCKED') {
    return { kind: 'KEY_IP_RESTRICTED', message: 'Google blocked this server under the key’s IP restrictions. Review the allowed server IPs for this hosting environment.' };
  }
  if (['SERVICE_DISABLED', 'API_KEY_SERVICE_BLOCKED'].includes(reason)) {
    return { kind: 'KEY_SERVICE_DISABLED', message: 'Enable the Gemini (Generative Language) API in this key’s Google project and allow that service in the key’s restrictions.' };
  }
  if (reason === 'BILLING_DISABLED' || ([400, 403].includes(code) && /billing/i.test(message) && /enable|required|disabled|not active/i.test(message))) {
    return { kind: 'KEY_BILLING_REQUIRED', message: 'Google requires billing to be enabled for this project or access tier. Review the project’s Google billing settings. No comic was generated.' };
  }
  if (/location|region|country/i.test(message) && /not supported|unsupported|not available/i.test(message)) {
    return { kind: 'KEY_REGION_UNSUPPORTED', message: 'Google rejected this request from the app server’s region. The app needs a supported hosting location; replacing the key may not resolve this.' };
  }
  if (reason === 'API_KEY_INVALID' || code === 401 || code === 16 || /API key not valid|invalid.*(?:api.?key|key)/i.test(message)) {
    return { kind: 'KEY_INVALID', message: 'That key was not accepted. Check that it is copied correctly and belongs to a Google project with the Gemini API enabled.' };
  }
  if (code === 429 || code === 8 || parsed?.status === 'RESOURCE_EXHAUSTED') {
    return { kind: 'KEY_QUOTA', message: 'Google’s key check reached a usage limit. Wait for a rate limit to reset or review your project’s quota and billing. No comic was generated.' };
  }
  if (code === 408 || code === 504 || parsed?.status === 'DEADLINE_EXCEEDED' || /timeout|timed out|aborted/i.test(message)) {
    return { kind: 'KEY_CHECK_TIMEOUT', message: 'Google did not finish the key check in time. Try again; a timeout does not establish that your key is invalid.' };
  }
  if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT'].includes(networkCode) || /fetch failed|network/i.test(message)) {
    return { kind: 'KEY_CHECK_NETWORK', message: 'The app server could not reach Google. Try again shortly; this does not establish that your key is invalid.' };
  }
  if (code === 404 || code === 5) {
    return { kind: 'KEY_METADATA_UNAVAILABLE', message: 'Google’s model-list check is unavailable for this request. Check Gemini API access or try again; this is not proof that the key is invalid.' };
  }
  if (code === 403 || code === 7) {
    return { kind: 'KEY_PERMISSION', message: 'Google denied Gemini API access. Check the key’s Google project permissions and API restrictions.' };
  }
  return { kind: 'KEY_CHECK_FAILED', message: 'Google could not complete the key check. Try again; this does not establish that your key is invalid.' };
}

export function redact(value, secrets) {
  let text = JSON.stringify(value);
  for (const secret of secrets.filter(Boolean)) {
    for (const variant of [secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1)]) {
      text = text.split(variant).join('[redacted]');
    }
  }
  // Also redact Google's usual key form, including a key echoed by a model.
  text = text.replace(/AIza[A-Za-z0-9_-]{20,}/g, '[redacted]');
  return text;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 25 * 1024 * 1024) {
        reject(new SessionError(413, 'Request is too large. Use smaller reference images.'));
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > 25 * 1024 * 1024) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new SessionError(400, 'Invalid JSON request.')); }
    });
    req.on('error', () => reject(new SessionError(400, 'Request interrupted.')));
  });
}

// Construct SDK parameters, never forward client-supplied URLs, headers,
// httpOptions, server history IDs, or other transport overrides.
function contentParams(body, signal) {
  if (body?.model !== 'gemini-2.5-flash' || !body.contents) throw new SessionError(400, 'Invalid text request.');
  const config = {};
  for (const field of ['systemInstruction', 'temperature', 'responseMimeType', 'responseSchema', 'maxOutputTokens']) {
    if (body.config?.[field] !== undefined) config[field] = body.config[field];
  }
  if (body.config?.tools !== undefined) {
    if (!Array.isArray(body.config.tools) || body.config.tools.some(tool => !tool.googleSearch || Object.keys(tool).length !== 1 || Object.keys(tool.googleSearch).length)) {
      throw new SessionError(400, 'Only Google Search grounding is supported.');
    }
    config.tools = [{ googleSearch: {} }];
  }
  const requestedTimeout = body.config?.httpOptions?.timeout;
  const timeout = Number.isInteger(requestedTimeout) && requestedTimeout >= 1000 && requestedTimeout <= 180_000
    ? requestedTimeout : 180_000;
  return { model: body.model, contents: body.contents, config: {
    ...config, abortSignal: signal, httpOptions: { timeout, retryOptions: { attempts: 1 } },
  } };
}

function imageParams(body) {
  const format = body?.response_format;
  if (!IMAGE_MODELS.has(body?.model) || !Array.isArray(body.input) || !body.input.length ||
      body.input.some(part => part.type === 'text' ? typeof part.text !== 'string' :
        part.type !== 'image' || typeof part.data !== 'string' || !['image/png', 'image/jpeg', 'image/webp'].includes(part.mime_type)) ||
      !['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '4:5', '5:4', '21:9'].includes(format?.aspect_ratio)) {
    throw new SessionError(400, 'Invalid image request.');
  }
  return {
    model: body.model,
    input: body.input.map(part => part.type === 'text' ? { type: 'text', text: part.text } : { type: 'image', data: part.data, mime_type: part.mime_type }),
    // Google rejects an explicit delivery override for these image models.
    // Follow the documented default; output_image still contains inline data.
    response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: format.aspect_ratio,
      ...(body.model === 'gemini-2.5-flash-image' ? {} : { image_size: '2K' }) },
    store: false, stream: false,
  };
}

export function createGeminiApi({ sessions = new CredentialSessions(), createClient = key => new GoogleGenAI({ apiKey: key, httpOptions: { timeout: 180_000 } }), secureCookies = true, imageTimeoutMs = 180_000 } = {}) {
  const timer = setInterval(() => sessions.prune(), 60_000);
  timer.unref();
  const handler = async (req, res, next) => {
    const path = req.url?.split('?')[0];
    if (!path?.startsWith('/api/gemini/')) return next?.();
    const secrets = [];
    const controller = new AbortController();
    let imageDeadline;
    const cancelUpstream = () => { if (!res.writableEnded) controller.abort(); };
    res.once('close', cancelUpstream);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', 'application/json');
    const send = (status, value) => {
      if (res.destroyed) return;
      res.statusCode = status; res.end(redact(value, secrets));
    };
    try {
      // Custom headers + strict origin checking prevent cross-site paid calls.
      const origin = req.headers.origin;
      if (req.headers['sec-fetch-site'] === 'cross-site' || (origin && new URL(origin).host !== req.headers.host)) {
        throw new SessionError(403, 'Cross-origin requests are not allowed.');
      }
      const tab = req.headers['x-gemini-tab'];
      if (typeof tab !== 'string' || !TAB_PATTERN.test(tab)) throw new SessionError(400, 'Invalid API session.');
      const name = secureCookies ? cookieName(tab) : `gemini-${tab}`;
      const cookie = req.headers.cookie?.split(';').map(item => item.trim()).find(item => item.startsWith(`${name}=`));
      const token = cookie?.slice(name.length + 1) || '';
      secrets.push(token);
      const current = sessions.get(token, tab, false);
      if (current) secrets.push(current.key);
      const setCookie = (value, maxAge) => res.setHeader('Set-Cookie', `${name}=${value}; Path=/api/gemini; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`);
      if (path === '/api/gemini/connect' && req.method === 'POST') {
        const body = await readBody(req);
        const key = typeof body?.key === 'string' ? body.key.trim() : '';
        secrets.push(key);
        if (!key || key.length > 512 || !/^[A-Za-z0-9_-]+$/.test(key)) throw new SessionError(400, 'Enter a valid Google Gemini API key.');
        const result = await sessions.connect(token, tab, key, async candidate => {
          // Validate credentials, not availability of one hard-coded model.
          // Listing metadata generates no content and makes just one attempt.
          await createClient(candidate).models.list({ config: {
            pageSize: 1, abortSignal: controller.signal,
            httpOptions: { timeout: 15_000, retryOptions: { attempts: 1 } },
          } });
          if (controller.signal.aborted) throw new SessionError(408, 'The key check was cancelled. Please try again.');
        });
        setCookie(result.token, Math.ceil(sessions.ttl / 1000));
        return send(200, { connected: true, expiresAt: result.expiresAt });
      }
      if (path === '/api/gemini/session' && req.method === 'DELETE') {
        sessions.remove(token, tab);
        setCookie('', 0);
        return send(200, { connected: false });
      }
      if (req.method !== 'POST' || !['/api/gemini/content', '/api/gemini/interactions'].includes(path)) {
        throw new SessionError(404, 'Unknown API request.');
      }
      const body = await readBody(req);
      const params = path.endsWith('/content') ? contentParams(body, controller.signal) : imageParams(body);
      const result = await sessions.request(token, tab, async key => {
        secrets.push(key);
        const client = createClient(key);
        if (path.endsWith('/content')) {
          const output = await client.models.generateContent(params);
          if (!output || typeof output !== 'object') {
            throw new GenerationResponseError('GENERATION_RESPONSE_INVALID', 'Google returned an unexpected text response. The app could not read the result.');
          }
          // SDK convenience getters are not included by JSON.stringify.
          return { ...output, text: output.text };
        }
        // The installed Interactions bridge disables timeout_ms whenever a
        // signal is supplied. Bound the signal itself, keeping client cancellation.
        imageDeadline = AbortSignal.timeout(imageTimeoutMs);
        const output = await client.interactions.create(params, {
          maxRetries: 0, timeout: imageTimeoutMs, signal: AbortSignal.any([controller.signal, imageDeadline]),
        });
        if (!output || typeof output !== 'object' || (output.steps !== undefined && !Array.isArray(output.steps))) {
          throw new GenerationResponseError('GENERATION_RESPONSE_INVALID', 'Google returned an unexpected image response. The app could not read the result.');
        }
        for (const step of output.steps || []) {
          if (!step || typeof step !== 'object') {
            throw new GenerationResponseError('GENERATION_RESPONSE_INVALID', 'Google returned an unexpected image step. The app could not read the result.');
          }
          if (step.type === 'model_output' && step.error) {
            throw new Error(JSON.stringify({ error: { ...step.error, status: RPC_STATUSES[step.error.code] || 'IMAGE_GENERATION_FAILED' } }));
          }
        }
        if (output.status !== 'completed') {
          const known = ['failed', 'in_progress', 'cancelled', 'incomplete'].includes(output.status);
          throw new GenerationResponseError(known ? 'GENERATION_INCOMPLETE' : 'GENERATION_RESPONSE_INVALID',
            known ? `Google returned an image interaction marked ${output.status}, not a completed image. Its final outcome and Google usage may be unknown.`
              : 'Google returned an unexpected image response without a recognized completion status.');
        }
        return { ...output, output_image: output.output_image, output_text: output.output_text };
      });
      return send(200, result);
    } catch (error) {
      // Never log upstream exceptions, bodies, headers, keys, or session IDs.
      if (error instanceof SessionError) return send(error.status, { error: { code: error.status, message: error.message } });
      const parsed = providerError(error);
      if (path !== '/api/gemini/connect') {
        const deadlineExpired = imageDeadline?.aborted && !controller.signal.aborted;
        const failure = generationFailure(deadlineExpired ? imageDeadline.reason : error, deadlineExpired ? {} : parsed, path.endsWith('/interactions') ? 'image' : 'text');
        return send(failure.code, { error: failure });
      }
      const code = Number(parsed?.code || error.status || error.statusCode || 502);
      const status = code >= 400 && code <= 599 ? code : (RPC_HTTP_CODES[code] || 502);
      const keyFailure = path === '/api/gemini/connect' ? keyCheckFailure(error, parsed, code) : null;
      return send(status, { error: {
        code: status, status: parsed?.status || RPC_STATUSES[code] || HTTP_STATUSES[status] || 'GOOGLE_REQUEST_FAILED',
        operation: path.endsWith('/interactions') ? 'image' : path.endsWith('/content') ? 'text' : 'key-check',
        ...(keyFailure ? keyFailure : { message: parsed?.message || 'Google could not complete this request. Check your connection, API access, billing and quota, then try again.' }),
      } });
    }
  };
  return { handler, sessions, close: () => { clearInterval(timer); sessions.clear(); } };
}
