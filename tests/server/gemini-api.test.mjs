import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { createGeminiApi, redact } from '../../server/gemini-api.mjs';
import { CredentialSessions, cookieName } from '../../server/sessions.mjs';

async function fixture(t, options = {}) {
  const calls = [];
  const client = key => ({
    models: {
      list: async params => {
        calls.push({ key, operation: 'metadata', params });
        if (key === 'bad-key') throw new Error(JSON.stringify({ error: { code: 403, status: 'PERMISSION_DENIED', message: `Invalid API key: ${key}` } }));
        await options.validate?.(key, params);
      },
      generateContent: async params => {
        calls.push({ key, operation: 'text', params });
        await options.generate?.(key, params);
        return { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'story' }] } }], get text() { return `story ${key}`; } };
      },
    },
    interactions: { create: async params => {
      calls.push({ key, operation: 'image', params });
      await options.interact?.(key, params);
      return Object.hasOwn(options, 'image') ? options.image : { status: 'completed', steps: [], get output_image() { return { data: 'base64', mime_type: 'image/jpeg' }; }, get output_text() { return ''; } };
    } },
  });
  const api = createGeminiApi({ createClient: client, ...options });
  const server = http.createServer((req, res) => { void api.handler(req, res, () => res.writeHead(404).end()); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { api.close(); await new Promise(resolve => server.close(resolve)); });
  const browser = (tab = randomUUID()) => {
    let cookie = '';
    return {
      tab, get cookie() { return cookie; },
      async request(endpoint, body, { method = 'POST', headers = {}, cookieOverride, signal } = {}) {
        const response = await fetch(`${url}/api/gemini/${endpoint}`, {
          method, signal, headers: { 'Content-Type': 'application/json', 'X-Gemini-Tab': tab, cookie: cookieOverride ?? cookie, ...headers },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        const text = await response.text();
        return { status: response.status, body: JSON.parse(text), text, setCookie, cache: response.headers.get('cache-control') };
      },
    };
  };
  return { api, browser, calls };
}
const content = { model: 'gemini-2.5-flash', contents: 'A story', config: { systemInstruction: 'Be funny', tools: [{ googleSearch: {} }] } };
const image = model => ({ model, input: [{ type: 'text', text: 'banana' }, { type: 'image', data: 'png', mime_type: 'image/png' }], response_format: { aspect_ratio: '16:9' }, store: true, stream: true, previous_interaction_id: 'private-history' });

for (const representation of ['error', 'body', 'prefixed-message', 'flat-message']) {
  test(`Interactions ${representation} errors retain safe provider details instead of GOOGLE_REQUEST_FAILED`, async t => {
    const { browser, calls } = await fixture(t, { interact: async key => {
      const detail = { code: 400, message: `Unsupported image setting; echoed credential ${key}` };
      const failure = Object.assign(new Error('400 Request rejected'), { status: 400 });
      if (representation === 'error') failure.error = detail;
      if (representation === 'body') failure.body = JSON.stringify({ error: detail });
      if (representation === 'prefixed-message') failure.message = `400 ${JSON.stringify({ error: detail })}`;
      if (representation === 'flat-message') failure.message = JSON.stringify(detail);
      throw failure;
    } });
    const user = browser();
    await user.request('connect', { key: 'private-test-key' });
    const result = await user.request('interactions', image('gemini-nano-banana-2.1'));
    assert.equal(result.status, 400);
    assert.equal(result.body.error.status, 'INVALID_ARGUMENT');
    assert.equal(result.body.error.operation, 'image');
    assert.match(result.body.error.message, /Unsupported image setting/);
    assert.ok(!result.text.includes('private-test-key'));
    assert.equal(calls.filter(call => call.operation === 'image').length, 1);
    assert.equal((await user.request('session', undefined, { method: 'DELETE' })).status, 200);
  });
}

test('invalid-argument image steps preserve RPC details and use HTTP 400', async t => {
  const { browser } = await fixture(t, { image: { status: 'failed', steps: [
    { type: 'model_output', error: { code: 3, message: 'Unsupported image input' } },
  ] } });
  const user = browser();
  await user.request('connect', { key: 'test-key' });
  const response = await user.request('interactions', image('gemini-nano-banana-2.1'));
  assert.equal(response.status, 400);
  assert.equal(response.body.error.status, 'INVALID_ARGUMENT');
  assert.match(response.body.error.message, /Unsupported image input/);
});

test('real SDK Interactions HTTP 400 retains provider diagnostics and makes no automatic retries', async t => {
  const methods = [];
  const { browser } = await fixture(t, { createClient: key => new GoogleGenAI({
    apiKey: key, httpOptions: { fetch: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const url = new URL(request.url);
      methods.push(request.method);
      if (request.method === 'GET' && url.pathname.endsWith('/models')) {
        return new Response(JSON.stringify({ models: [{ name: 'models/example' }] }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }
      assert.ok(url.pathname.endsWith('/interactions'));
      assert.equal(request.method, 'POST');
      return new Response(JSON.stringify({ error: {
        code: 400, status: 'INVALID_ARGUMENT', message: `Unsupported image setting; ${key}`,
      } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    } },
  }) });
  const user = browser();
  assert.equal((await user.request('connect', { key: 'sdk-image-test-key' })).status, 200);
  const response = await user.request('interactions', image('gemini-nano-banana-2.1'));
  assert.equal(response.status, 400);
  assert.equal(response.body.error.status, 'INVALID_ARGUMENT');
  assert.match(response.body.error.message, /Unsupported image setting/);
  assert.ok(!response.text.includes('sdk-image-test-key'));
  assert.deepEqual(methods, ['GET', 'POST']);
});

test('key validation lists metadata once, without a model dependency or generated content', async t => {
  const { browser, calls } = await fixture(t);
  assert.equal((await browser().request('connect', { key: 'metadata-key' })).status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].operation, 'metadata');
  assert.equal(calls[0].params.model, undefined);
  assert.equal(calls[0].params.config.pageSize, 1);
  assert.deepEqual(calls[0].params.config.httpOptions, { timeout: 15_000, retryOptions: { attempts: 1 } });
  assert.ok(calls[0].params.config.abortSignal instanceof AbortSignal);
});

for (const [label, failure, expectedCode, expectedKind] of [
  ['network', () => Object.assign(new TypeError('fetch failed private-key'), { cause: { code: 'ENOTFOUND' } }), 502, 'GENERATION_NETWORK'],
  ['timeout', () => Object.assign(new Error('Request timed out private-key'), { name: 'APIConnectionTimeoutError' }), 504, 'GENERATION_TIMEOUT'],
  ['cancelled', () => Object.assign(new Error('aborted private-key'), { name: 'APIUserAbortError' }), 408, 'GENERATION_CANCELLED'],
  ['unknown', () => new Error('internal raw body Authorization: Bearer private-key'), 502, 'GENERATION_UNKNOWN'],
  ['upstream', () => Object.assign(new Error('502 raw proxy HTML private-key'), { status: 502,
    error: { code: 502, message: 'Provider temporarily unavailable private-key' } }), 502, 'GOOGLE_UPSTREAM_ERROR'],
]) {
  for (const endpoint of ['content', 'interactions']) {
    test(`${endpoint} ${label} failure is distinguishable, safe and releases the request lock`, async t => {
      const fail = async () => { throw failure(); };
      const { browser, calls } = await fixture(t, { generate: fail, interact: fail });
      const user = browser();
      await user.request('connect', { key: 'private-key' });
      const response = await user.request(endpoint, endpoint === 'content' ? content : image('gemini-nano-banana-2.1'));
      assert.equal(response.status, expectedCode);
      assert.equal(response.body.error.kind, expectedKind);
      assert.equal(response.body.error.operation, endpoint === 'content' ? 'text' : 'image');
      assert.ok(!response.text.includes('private-key'));
      assert.ok(!response.text.includes('raw body') && !response.text.includes('raw proxy'));
      assert.equal(calls.filter(call => call.operation !== 'metadata').length, 1);
      assert.equal((await user.request('session', undefined, { method: 'DELETE' })).status, 200);
    });
  }
}

for (const output of [null, { status: 'mysterious' }, { status: 'completed', steps: {} }, { status: 'completed', steps: [null] }, { status: 'in_progress', steps: [] }]) {
  test(`unexpected interaction output ${JSON.stringify(output)} has safe response diagnostics`, async t => {
    const { browser } = await fixture(t, { image: output });
    const user = browser();
    await user.request('connect', { key: 'response-key' });
    const response = await user.request('interactions', image('gemini-nano-banana-2.1'));
    assert.equal(response.status, 502);
    assert.equal(response.body.error.kind, output?.status === 'in_progress' ? 'GENERATION_INCOMPLETE' : 'GENERATION_RESPONSE_INVALID');
    assert.equal(response.body.error.operation, 'image');
    assert.equal((await user.request('session', undefined, { method: 'DELETE' })).status, 200);
  });
}

for (const mode of ['network', 'timeout', '502', 'html-502']) {
  test(`installed SDK ${mode} image failure retains the correct diagnostic without retry`, async t => {
    const methods = [];
    const { browser } = await fixture(t, { imageTimeoutMs: mode === 'timeout' ? 20 : 180_000, createClient: key => {
      const client = new GoogleGenAI({ apiKey: key, httpOptions: { fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        methods.push(request.method);
        if (request.method === 'GET') {
          return new Response(JSON.stringify({ models: [{ name: 'models/example' }] }), { headers: { 'Content-Type': 'application/json' } });
        }
        if (mode === 'network') throw Object.assign(new TypeError(`fetch failed ${key}`), { cause: { code: 'ECONNRESET' } });
        if (mode === 'timeout') {
          await new Promise((_, reject) => {
            const cancel = () => reject(request.signal.reason);
            if (request.signal.aborted) cancel();
            else request.signal.addEventListener('abort', cancel, { once: true });
          });
        }
        if (mode === 'html-502') return new Response(`<html>private proxy body ${key}</html>`, { status: 502 });
        return new Response(JSON.stringify({ error: { code: 502, message: `Provider unavailable ${key}` } }), { status: 502, headers: { 'Content-Type': 'application/json' } });
      } } });
      return client;
    } });
    const user = browser();
    await user.request('connect', { key: 'sdk-private-key' });
    const response = await user.request('interactions', image('gemini-nano-banana-2.1'));
    assert.equal(response.status, mode === 'timeout' ? 504 : 502);
    assert.equal(response.body.error.kind, mode === 'network' ? 'GENERATION_NETWORK' : mode === 'timeout' ? 'GENERATION_TIMEOUT' : 'GOOGLE_UPSTREAM_ERROR');
    assert.ok(!response.text.includes('sdk-private-key'));
    assert.ok(!response.text.includes('<html>') && !response.text.includes('private proxy body'));
    assert.deepEqual(methods, ['GET', 'POST']);
    assert.equal((await user.request('session', undefined, { method: 'DELETE' })).status, 200);
  });
}

test('generation diagnostics redact session tokens, URLs and private headers as well as the key', async t => {
  let token;
  const { browser } = await fixture(t, { interact: async key => {
    throw Object.assign(new Error('private SDK body'), { status: 502, error: { code: 502,
      message: `Temporarily unavailable; ${key}; ${token}; https://google.invalid/?credential=secret-other\nAuthorization: Bearer secret-other` } });
  } });
  const user = browser();
  await user.request('connect', { key: 'safe-key' });
  token = user.cookie.split('=')[1];
  const response = await user.request('interactions', image('gemini-nano-banana-2.1'));
  assert.match(response.body.error.message, /Temporarily unavailable/);
  for (const secret of ['safe-key', token, 'secret-other', 'private SDK body']) assert.ok(!response.text.includes(secret));
});

test('real SDK sends a single model-list metadata request without any generated content', async t => {
  const urls = [];
  const { browser } = await fixture(t, { createClient: key => new GoogleGenAI({
    apiKey: key, httpOptions: { fetch: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      urls.push(new URL(request.url));
      assert.equal(request.method, 'GET');
      assert.equal(request.headers.get('x-goog-api-key'), 'sdk-test-key');
      return new Response(JSON.stringify({ models: [{ name: 'models/example-model' }] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    } },
  }) });
  assert.equal((await browser().request('connect', { key: 'sdk-test-key' })).status, 200);
  assert.equal(urls.length, 1);
  assert.equal(urls[0].pathname, '/v1beta/models');
  assert.equal(urls[0].searchParams.get('pageSize'), '1');
  assert.equal(urls[0].searchParams.has('key'), false);
});

for (const [code, status, reason, message, kind] of [
  [400, 'INVALID_ARGUMENT', 'API_KEY_INVALID', 'API key not valid', 'KEY_INVALID'],
  [403, 'PERMISSION_DENIED', 'API_KEY_HTTP_REFERRER_BLOCKED', 'Forbidden', 'KEY_WEBSITE_RESTRICTED'],
  [403, 'PERMISSION_DENIED', 'API_KEY_IP_ADDRESS_BLOCKED', 'Forbidden', 'KEY_IP_RESTRICTED'],
  [403, 'PERMISSION_DENIED', 'API_KEY_SERVICE_BLOCKED', 'Forbidden', 'KEY_SERVICE_DISABLED'],
  [403, 'PERMISSION_DENIED', '', 'Access denied', 'KEY_PERMISSION'],
  [400, 'FAILED_PRECONDITION', '', 'User location is not supported', 'KEY_REGION_UNSUPPORTED'],
  [400, 'FAILED_PRECONDITION', '', 'Free tier is not available in your country. Please enable billing', 'KEY_BILLING_REQUIRED'],
  [429, 'RESOURCE_EXHAUSTED', '', 'Quota exceeded', 'KEY_QUOTA'],
  [404, 'NOT_FOUND', '', 'Model metadata unavailable', 'KEY_METADATA_UNAVAILABLE'],
  [504, 'DEADLINE_EXCEEDED', '', 'Deadline exceeded', 'KEY_CHECK_TIMEOUT'],
  [503, 'UNAVAILABLE', '', 'Unavailable', 'KEY_CHECK_FAILED'],
]) {
  test(`key-check failure ${kind} is specific, safe, and preserves a working key`, async t => {
    const { browser, api } = await fixture(t, { validate: async key => {
      if (key === 'candidate-private-key') throw new Error(JSON.stringify({ error: {
        code, status, message: `${message}: ${key}`, details: reason ? [{ reason }] : [],
      } }));
    } });
    const user = browser();
    await user.request('connect', { key: 'existing-key' });
    const result = await user.request('connect', { key: 'candidate-private-key' });
    assert.equal(result.status, code);
    assert.equal(result.body.error.kind, kind);
    assert.ok(!result.text.includes('candidate-private-key'));
    assert.equal(api.sessions.sessions.size, 1);
    assert.equal((await user.request('content', content)).status, 200);
  });
}

test('key-check network errors and malformed details remain safe and release the lock', async t => {
  const { browser, calls } = await fixture(t, { validate: async key => {
    if (key === 'network-key') throw Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    if (key === 'malformed-key') throw new Error(JSON.stringify({ error: { code: 500, details: {}, message: 'Unexpected response' } }));
  } });
  const user = browser();
  assert.equal((await user.request('connect', { key: 'network-key' })).body.error.kind, 'KEY_CHECK_NETWORK');
  assert.equal((await user.request('connect', { key: 'malformed-key' })).body.error.kind, 'KEY_CHECK_FAILED');
  assert.equal((await user.request('connect', { key: 'valid-key' })).status, 200);
  assert.equal(calls.length, 3);
});

test('isolated users and tabs cannot borrow credentials; cookies are secure and opaque', async t => {
  const { browser, calls } = await fixture(t);
  const alice = browser(), bob = browser(), empty = browser();
  const connected = await alice.request('connect', { key: 'alice-key' });
  assert.equal(connected.status, 200);
  assert.match(connected.setCookie, /HttpOnly; SameSite=Strict; Max-Age=1800; Secure/);
  assert.equal(connected.cache, 'no-store');
  assert.ok(!connected.text.includes('alice-key') && !connected.setCookie.includes('alice-key'));
  assert.equal((await empty.request('content', content)).status, 401);
  assert.equal((await bob.request('content', content, { cookieOverride: alice.cookie })).status, 401);
  await bob.request('connect', { key: 'bob-key' });
  await Promise.all([alice.request('content', content), bob.request('interactions', image('gemini-nano-banana-2.1'))]);
  assert.deepEqual(calls.filter(call => call.operation !== 'metadata').map(call => call.key).sort(), ['alice-key', 'bob-key']);
  assert.ok(alice.cookie.startsWith(cookieName(alice.tab)));
});

test('failed replacement keeps the old credential; success rotates it and revokes old token', async t => {
  const { browser, calls } = await fixture(t);
  const user = browser();
  await user.request('connect', { key: 'working-key' });
  const oldCookie = user.cookie;
  const failed = await user.request('connect', { key: 'bad-key' });
  assert.equal(failed.status, 403);
  assert.match(failed.body.error.status, /PERMISSION_DENIED/);
  assert.ok(!failed.text.includes('bad-key'));
  assert.equal(user.cookie, oldCookie);
  await user.request('content', content);
  assert.equal(calls.at(-1).key, 'working-key');
  await user.request('connect', { key: 'replacement-key' });
  assert.notEqual(user.cookie, oldCookie);
  assert.equal((await user.request('content', content, { cookieOverride: oldCookie })).status, 401);
  await user.request('content', content);
  assert.equal(calls.at(-1).key, 'replacement-key');
});

test('removal is idempotent and refresh cannot restore a session; expiry is enforced server-side', async t => {
  let now = 1000;
  const sessions = new CredentialSessions({ now: () => now, ttl: 100 });
  const { browser, api } = await fixture(t, { sessions });
  const user = browser();
  await user.request('connect', { key: 'personal-key' });
  const refreshed = browser();
  assert.equal((await refreshed.request('content', content, { cookieOverride: user.cookie })).status, 401);
  now = 1100;
  assert.equal((await user.request('content', content)).status, 401);
  assert.equal(api.sessions.sessions.size, 0);
  await user.request('connect', { key: 'personal-key' });
  const saved = user.cookie;
  assert.equal((await user.request('session', undefined, { method: 'DELETE' })).status, 200);
  assert.equal((await user.request('content', content, { cookieOverride: saved })).status, 401);
  assert.equal((await user.request('session', undefined, { method: 'DELETE' })).status, 200);
  assert.equal(api.sessions.sessions.size, 0);
});

test('server blocks replacement and removal during generation, even after expiry', async t => {
  let release, started;
  let now = 0;
  const signal = new Promise(resolve => { started = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  const { browser, calls, api } = await fixture(t, {
    sessions: new CredentialSessions({ now: () => now, ttl: 100 }),
    generate: async () => { started(); await held; },
  });
  const user = browser();
  await user.request('connect', { key: 'active-key' });
  const running = user.request('content', content);
  await signal;
  assert.equal((await user.request('connect', { key: 'new-key' })).status, 409);
  assert.equal((await user.request('session', undefined, { method: 'DELETE' })).status, 409);
  now = 100;
  assert.equal((await user.request('content', content)).status, 401);
  release();
  assert.equal((await running).status, 200);
  assert.equal(calls.filter(call => call.operation === 'metadata').length, 1);
  assert.equal(api.sessions.sessions.size, 0);
});

test('metadata check locks concurrent connect, remove and generation; cleanup survives rejection', async t => {
  let release, started;
  const signal = new Promise(resolve => { started = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  const { browser } = await fixture(t, { validate: async key => { if (key === 'slow-key') { started(); await held; } } });
  const user = browser();
  await user.request('connect', { key: 'old-key' });
  const running = user.request('connect', { key: 'slow-key' });
  await signal;
  for (const [endpoint, body, method] of [['connect', { key: 'other-key' }, 'POST'], ['session', undefined, 'DELETE'], ['content', content, 'POST']]) {
    assert.equal((await user.request(endpoint, body, { method })).status, 409);
  }
  release();
  assert.equal((await running).status, 200);
  assert.equal((await user.request('content', content)).status, 200);
});

test('text, grounded news and image requests use the server key and disallow transport overrides', async t => {
  const { browser, calls } = await fixture(t);
  const user = browser();
  await user.request('connect', { key: 'server-only-key' });
  const output = await user.request('content', { ...content, httpOptions: { baseUrl: 'http://attacker' }, config: { ...content.config, httpOptions: { headers: { 'x-goog-api-key': 'attacker' } } } });
  assert.match(output.body.text, /story \[redacted\]/);
  assert.equal(calls.at(-1).params.config.systemInstruction, 'Be funny');
  assert.deepEqual(calls.at(-1).params.config.tools, [{ googleSearch: {} }]);
  assert.deepEqual(calls.at(-1).params.config.httpOptions, { timeout: 180000, retryOptions: { attempts: 1 } });
  for (const model of ['gemini-nano-banana-2.1', 'gemini-2.5-flash-image']) {
    const result = await user.request('interactions', image(model));
    assert.equal(result.status, 200);
    assert.equal(result.body.output_image.data, 'base64');
    const params = calls.at(-1).params;
    assert.equal(params.store, false);
    assert.equal(params.stream, false);
    assert.equal(params.previous_interaction_id, undefined);
    assert.equal(params.response_format.image_size, model.endsWith('flash-image') ? undefined : '2K');
    assert.equal(params.response_format.delivery, 'inline');
    assert.equal(params.response_format.aspect_ratio, '16:9');
  }
  assert.equal((await user.request('content', { ...content, config: { tools: [{ urlContext: {} }] } })).status, 400);
  assert.equal((await user.request('content', { ...content, model: 'unapproved' })).status, 400);
});

test('upstream errors are redacted, retain billing/quota codes, and never reach logs', async t => {
  const logs = [];
  const original = { log: console.log, error: console.error, warn: console.warn };
  for (const method of Object.keys(original)) console[method] = (...args) => logs.push(args.join(' '));
  t.after(() => Object.assign(console, original));
  const { browser } = await fixture(t, {
    generate: async key => { throw new Error(JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: `Billing quota exceeded for ${key}` } })); },
    image: { status: 'failed', steps: [{ type: 'model_output', error: { code: 8, message: 'Quota personal-key' } }] },
  });
  const user = browser();
  await user.request('connect', { key: 'personal-key' });
  for (const [endpoint, body] of [['content', content], ['interactions', image('gemini-nano-banana-2.1')]]) {
    const result = await user.request(endpoint, body);
    assert.equal(result.status, 429);
    assert.equal(result.body.error.status, 'RESOURCE_EXHAUSTED');
    assert.ok(!result.text.includes('personal-key'));
  }
  assert.deepEqual(logs, []);
  assert.ok(!redact({ message: 'key/encoded key%2Fencoded' }, ['key/encoded']).includes('key'));
});

test('cross-origin, missing tab, oversized and malformed requests cannot reach Google', async t => {
  const { browser, calls } = await fixture(t);
  const user = browser();
  for (const headers of [{ Origin: 'https://attacker.example' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await user.request('connect', { key: 'never-used' }, { headers })).status, 403);
  }
  assert.equal((await user.request('connect', { key: 'never-used' }, { headers: { 'X-Gemini-Tab': '' } })).status, 400);
  assert.equal((await user.request('connect', { key: 'a'.repeat(513) })).status, 400);
  assert.equal((await user.request('content', { contents: 'a'.repeat(26 * 1024 * 1024) })).status, 413);
  assert.equal(calls.length, 0);
});

test('cancelling a browser lookup aborts Google and releases its active-session lock', async t => {
  let started, aborted;
  const startedSignal = new Promise(resolve => { started = resolve; });
  const abortedSignal = new Promise(resolve => { aborted = resolve; });
  const { browser, api } = await fixture(t, { generate: async (_key, params) => {
    assert.equal(params.config.httpOptions.timeout, 20000);
    assert.deepEqual(params.config.httpOptions.retryOptions, { attempts: 1 });
    started();
    await new Promise((_, reject) => {
      const cancel = () => { aborted(); reject(new Error('Cancelled')); };
      if (params.config.abortSignal.aborted) cancel();
      else params.config.abortSignal.addEventListener('abort', cancel, { once: true });
    });
  } });
  const user = browser();
  await user.request('connect', { key: 'news-key' });
  const controller = new AbortController();
  const running = user.request('content', { ...content, config: { ...content.config, httpOptions: { timeout: 20000, retryOptions: { attempts: 99 } } } }, { signal: controller.signal });
  // Handle rejection immediately so Node never observes an unhandled abort.
  const cancelled = assert.rejects(running, error => error.name === 'AbortError');
  await startedSignal;
  assert.equal((await user.request('session', undefined, { method: 'DELETE' })).status, 409);
  controller.abort();
  await cancelled;
  await abortedSignal;
  // Let the request's finally block release the key before checking removal.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await user.request('session', undefined, { method: 'DELETE' })).status, 200);
  assert.equal(api.sessions.sessions.size, 0);
});
