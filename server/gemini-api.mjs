import { GoogleGenAI } from '@google/genai';
import { CredentialSessions, SessionError, SESSION_TTL, TAB_PATTERN, cookieName } from './sessions.mjs';

const IMAGE_MODELS = new Set(['gemini-nano-banana-2.1', 'gemini-2.5-flash-image']);
const RPC_STATUSES = { 3: 'INVALID_ARGUMENT', 5: 'NOT_FOUND', 7: 'PERMISSION_DENIED', 8: 'RESOURCE_EXHAUSTED', 13: 'INTERNAL', 14: 'UNAVAILABLE', 16: 'UNAUTHENTICATED' };

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
    response_format: { type: 'image', delivery: 'inline', mime_type: 'image/jpeg', aspect_ratio: format.aspect_ratio,
      ...(body.model === 'gemini-2.5-flash-image' ? {} : { image_size: '2K' }) },
    store: false, stream: false,
  };
}

export function createGeminiApi({ sessions = new CredentialSessions(), createClient = key => new GoogleGenAI({ apiKey: key, httpOptions: { timeout: 180_000 } }), secureCookies = true } = {}) {
  const timer = setInterval(() => sessions.prune(), 60_000);
  timer.unref();
  const handler = async (req, res, next) => {
    const path = req.url?.split('?')[0];
    if (!path?.startsWith('/api/gemini/')) return next?.();
    const secrets = [];
    const controller = new AbortController();
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
      const current = sessions.get(token, tab, false);
      if (current) secrets.push(current.key);
      const setCookie = (value, maxAge) => res.setHeader('Set-Cookie', `${name}=${value}; Path=/api/gemini; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`);
      if (path === '/api/gemini/connect' && req.method === 'POST') {
        const body = await readBody(req);
        const key = typeof body?.key === 'string' ? body.key.trim() : '';
        secrets.push(key);
        if (!key || key.length > 512 || !/^[A-Za-z0-9_-]+$/.test(key)) throw new SessionError(400, 'Enter a valid Google Gemini API key.');
        const result = await sessions.connect(token, tab, key, async candidate => {
          await createClient(candidate).models.get({ model: 'gemini-2.5-flash' });
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
          // SDK convenience getters are not included by JSON.stringify.
          return { ...output, text: output.text };
        }
        const output = await client.interactions.create(params);
        for (const step of output.steps || []) {
          if (step.type === 'model_output' && step.error) {
            throw new Error(JSON.stringify({ error: { ...step.error, status: RPC_STATUSES[step.error.code] || 'IMAGE_GENERATION_FAILED' } }));
          }
        }
        if (output.status !== 'completed') throw new SessionError(502, `Google image interaction ${output.status}. Please try again.`);
        return { ...output, output_image: output.output_image, output_text: output.output_text };
      });
      return send(200, result);
    } catch (error) {
      // Never log upstream exceptions, bodies, headers, keys, or session IDs.
      if (error instanceof SessionError) return send(error.status, { error: { code: error.status, message: error.message } });
      let parsed;
      try { parsed = JSON.parse(error.message)?.error; } catch { /* non-JSON upstream error */ }
      const code = Number(parsed?.code || error.status || 502);
      const status = code >= 400 && code <= 599 ? code : (code === 8 ? 429 : code === 7 ? 403 : 502);
      return send(status, { error: {
        code: status, status: parsed?.status || RPC_STATUSES[code] || 'GOOGLE_REQUEST_FAILED',
        message: parsed?.message || 'Google could not complete this request. Check your connection, API access, billing and quota, then try again.',
      } });
    }
  };
  return { handler, sessions, close: () => { clearInterval(timer); sessions.clear(); } };
}
