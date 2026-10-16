import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { createGeminiApi } from '../../server/gemini-api.mjs';
import { CredentialSessions } from '../../server/sessions.mjs';
import { parseGroundedNews } from '../../shared/news-parsing.mjs';
import { describeNewsError } from '../../shared/news-errors.mjs';

const source = { title: 'Example News', url: 'https://example.com/story' };
const story = { title: 'A sourced headline', description: 'A factual story.', source_urls: [source.url] };
function upstream(items = [story]) {
  const text = JSON.stringify(items);
  return { candidates: [{ content: { parts: [{ text }] }, groundingMetadata: {
    groundingChunks: [{ web: { uri: source.url, title: source.title } }],
    groundingSupports: [{ segment: { startIndex: 0, endIndex: new TextEncoder().encode(text).length }, groundingChunkIndices: [0] }],
    searchEntryPoint: { renderedContent: '<div>Google search suggestions</div>' },
  } }], text, ignoredProviderPayload: 'x'.repeat(50_000) };
}

async function fixture(t, { generate = async () => upstream(), ...options } = {}) {
  const calls = [];
  const createClient = key => ({ models: {
    list: async () => {},
    generateContent: async params => { calls.push(params); return generate(params, key); },
  } });
  const api = createGeminiApi({ createClient, ...options });
  const server = http.createServer((req, res) => void api.handler(req, res, () => res.writeHead(404).end()));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { api.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const url = `http://127.0.0.1:${server.address().port}/api/gemini/`;
  const user = () => {
    const tab = randomUUID();
    let cookie = '';
    return {
      async request(endpoint, body = {}, { signal, method = 'POST', headers = {}, cookieOverride } = {}) {
        const response = await fetch(url + endpoint, { signal, method, headers: {
          'Content-Type': 'application/json', 'X-Gemini-Tab': tab, cookie: cookieOverride ?? cookie, ...headers,
        }, ...(method === 'DELETE' ? {} : { body: JSON.stringify(body) }) });
        if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
        return { code: response.status, body: await response.json(), timing: response.headers.get('server-timing') };
      },
      get cookie() { return cookie; },
    };
  };
  return { user, calls, api };
}

test('news endpoint owns the request, returns a compact sourced feed and reports safe stage timings', async t => {
  const { user, calls } = await fixture(t);
  const client = user();
  await client.request('connect', { key: 'news-test-key' });
  const result = await client.request('news');
  assert.equal(result.code, 200);
  assert.deepEqual(result.body.stories[0].sources, [source]);
  assert.equal(result.body.searchSuggestions, '<div>Google search suggestions</div>');
  assert.ok(Number.isFinite(result.body.fetchedAt));
  assert.match(result.timing, /news_lookup;dur=\d+\.\d, news_parse;dur=\d+\.\d, news_cache;desc="miss"/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'gemini-2.5-flash');
  assert.match(calls[0].contents, /past 24 hours/);
  assert.deepEqual(calls[0].config.tools, [{ googleSearch: {} }]);
  assert.match(calls[0].contents, /U\.S.-focused and international/);
  assert.match(calls[0].contents, /1-2 factual sentences/);
  assert.deepEqual(calls[0].config.thinkingConfig, { thinkingBudget: 1024 });
  assert.deepEqual(calls[0].config.httpOptions, { timeout: 60_000, retryOptions: { attempts: 1 } });
  const originalBytes = Buffer.byteLength(JSON.stringify(upstream()));
  const normalizedBytes = Buffer.byteLength(JSON.stringify(result.body));
  assert.ok(normalizedBytes < 1000 && normalizedBytes < originalBytes / 10);
  assert.equal(result.body.candidates, undefined);
  assert.equal(result.body.text, undefined);
  assert.equal(result.body.ignoredProviderPayload, undefined);
  t.diagnostic(`Offline fixture bytes: raw=${originalBytes}, normalized=${normalizedBytes}; no live Google latency measured.`);
});

test('fresh cache avoids Google calls; explicit refresh makes exactly one new lookup', async t => {
  const { user, calls } = await fixture(t);
  const client = user();
  await client.request('connect', { key: 'cache-key' });
  const first = await client.request('news');
  const second = await client.request('news');
  assert.deepEqual(first.body, second.body);
  assert.match(second.timing, /desc="hit"/);
  assert.equal(calls.length, 1);
  await client.request('news', { forceRefresh: true });
  assert.equal(calls.length, 2);
});

test('concurrent session callers including force-refresh share one upstream lookup', async t => {
  let release, started;
  const held = new Promise(resolve => { release = resolve; });
  const active = new Promise(resolve => { started = resolve; });
  const { user, calls } = await fixture(t, { generate: async () => { started(); await held; return upstream(); } });
  const client = user();
  await client.request('connect', { key: 'concurrent-key' });
  const first = client.request('news');
  await active;
  const second = client.request('news', { forceRefresh: true });
  // Let both subscribers register before releasing the provider.
  await new Promise(resolve => setTimeout(resolve, 30));
  release();
  const result = await Promise.all([first, second]);
  assert.equal(calls.length, 1);
  assert.deepEqual(result[0].body, result[1].body);
  assert.match(result[1].timing, /desc="shared"/);
});

test('same-key sessions never share cache; rotation, removal and expiry revoke cached access', async t => {
  let now = Date.now();
  const sessions = new CredentialSessions({ now: () => now });
  const { user, calls } = await fixture(t, { sessions });
  const a = user(), b = user();
  await a.request('connect', { key: 'same-key' });
  await b.request('connect', { key: 'same-key' });
  await a.request('news');
  await b.request('news');
  assert.equal(calls.length, 2);
  const oldCookie = a.cookie;
  await a.request('connect', { key: 'replacement-key' });
  assert.equal((await a.request('news', {}, { cookieOverride: oldCookie })).code, 401);
  await a.request('news');
  assert.equal(calls.length, 3);
  now += 31 * 60_000;
  assert.equal((await a.request('news')).code, 401);
  await b.request('session', {}, { method: 'DELETE' });
  assert.equal((await b.request('news')).code, 401);
  assert.equal(calls.length, 3);
});

test('server cache has a fixed entry bound and evicts idle results without cross-session reuse', async t => {
  const { user, calls } = await fixture(t, { newsMaxEntries: 1 });
  const a = user(), b = user();
  await a.request('connect', { key: 'a-key' });
  await b.request('connect', { key: 'b-key' });
  await a.request('news');
  await b.request('news');
  await a.request('news');
  assert.equal(calls.length, 3);
});

test('server cache expires before a longer credential session; expiry during lookup cannot publish results', async t => {
  let now = Date.now(), release;
  let hold = false;
  const sessions = new CredentialSessions({ now: () => now, ttl: 2 * 60 * 60_000 });
  const { user, calls } = await fixture(t, { sessions, generate: async () => {
    if (hold) await new Promise(resolve => { release = resolve; });
    return upstream();
  } });
  const client = user();
  await client.request('connect', { key: 'expiry-key' });
  await client.request('news');
  now += 31 * 60_000;
  await client.request('news');
  assert.equal(calls.length, 2);
  hold = true;
  const running = client.request('news', { forceRefresh: true });
  while (!release) await new Promise(resolve => setImmediate(resolve));
  now += 2 * 60 * 60_000;
  release();
  assert.equal((await running).code, 401);
  assert.equal((await client.request('news')).code, 401);
  assert.equal(calls.length, 3);
});

test('full active news capacity rejects new work without charging another session', async t => {
  let release;
  const { user, calls } = await fixture(t, { newsMaxEntries: 1, generate: async () => {
    await new Promise(resolve => { release = resolve; });
    return upstream();
  } });
  const a = user(), b = user();
  await a.request('connect', { key: 'active-a' });
  await b.request('connect', { key: 'active-b' });
  const running = a.request('news');
  while (!release) await new Promise(resolve => setImmediate(resolve));
  assert.equal((await b.request('news')).code, 503);
  assert.equal(calls.length, 1);
  release();
  assert.equal((await running).code, 200);
});

for (const [code, status, kind] of [[504, 'DEADLINE_EXCEEDED', 'GENERATION_TIMEOUT'], [502, 'BAD_GATEWAY', 'GOOGLE_UPSTREAM_ERROR'], [403, 'PERMISSION_DENIED', 'GOOGLE_UPSTREAM_ERROR'], [429, 'RESOURCE_EXHAUSTED', 'GOOGLE_UPSTREAM_ERROR']]) {
  test(`news ${code} failure never causes an automatic paid retry`, async t => {
    const { user, calls } = await fixture(t, { generate: async (_params, key) => {
      throw Object.assign(new Error('Private SDK error'), { status: code, error: {
        code, status, message: `Diagnostic 403 and billing 429 are incidental prose ${key}`,
      } });
    } });
    const client = user();
    await client.request('connect', { key: 'private-news-key' });
    const result = await client.request('news');
    assert.equal(result.code, code);
    assert.equal(result.body.error.kind, kind);
    assert.equal(result.body.error.operation, 'news');
    assert.ok(!JSON.stringify(result).includes('private-news-key'));
    assert.equal(calls.length, 1);
    assert.equal((await client.request('session', {}, { method: 'DELETE' })).code, 200);
  });
}

test('server-owned deadline aborts upstream, releases the key lock and never retries', async t => {
  let aborted = false;
  const { user, calls } = await fixture(t, { newsTimeoutMs: 25, generate: async params => {
    await new Promise((_, reject) => params.config.abortSignal.addEventListener('abort', () => {
      aborted = true; reject(params.config.abortSignal.reason);
    }, { once: true }));
  } });
  const client = user();
  await client.request('connect', { key: 'timeout-key' });
  const started = performance.now();
  const result = await client.request('news');
  assert.equal(result.code, 504);
  assert.equal(result.body.error.kind, 'GENERATION_TIMEOUT');
  assert.equal(calls.length, 1);
  assert.ok(aborted);
  assert.ok(performance.now() - started < 1000);
  assert.equal((await client.request('session', {}, { method: 'DELETE' })).code, 200);
});

test('one cancelled waiter does not cancel another; all cancelled waiters abort upstream', async t => {
  let release, started, stopped;
  const active = new Promise(resolve => { started = resolve; });
  const aborted = new Promise(resolve => { stopped = resolve; });
  const { user, calls } = await fixture(t, { generate: params => new Promise((resolve, reject) => {
    release = () => resolve(upstream());
    started();
    params.config.abortSignal.addEventListener('abort', () => { stopped(); reject(params.config.abortSignal.reason); }, { once: true });
  }) });
  const client = user();
  await client.request('connect', { key: 'cancel-key' });
  const controller = new AbortController();
  const first = client.request('news', {}, { signal: controller.signal });
  const rejected = assert.rejects(first);
  await active;
  const second = client.request('news');
  await new Promise(resolve => setTimeout(resolve, 30));
  controller.abort();
  await rejected;
  assert.equal((await client.request('connect', { key: 'replacement' })).code, 409);
  release();
  assert.equal((await second).code, 200);
  assert.equal(calls.length, 1);
  const cancelAll = new AbortController();
  const running = client.request('news', { forceRefresh: true }, { signal: cancelAll.signal });
  const cancelled = assert.rejects(running);
  while (calls.length < 2) await new Promise(resolve => setImmediate(resolve));
  cancelAll.abort();
  await cancelled;
  await aborted;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await client.request('session', {}, { method: 'DELETE' })).code, 200);
});

test('fixed news endpoint rejects caller model/prompt/transport overrides and cross-origin calls', async t => {
  const { user, calls } = await fixture(t);
  const client = user();
  assert.equal((await client.request('news')).code, 401);
  await client.request('connect', { key: 'fixed-key' });
  for (const body of [{ forceRefresh: 'true' }, { model: 'other' }, { contents: 'override' }, { httpOptions: { baseUrl: 'https://example.com' } }]) {
    assert.equal((await client.request('news', body)).code, 400);
  }
  assert.equal((await client.request('news', {}, { headers: { Origin: 'https://attacker.invalid' } })).code, 403);
  assert.equal(calls.length, 0);
});

for (const [label, output, kind] of [
  ['malformed', { ...upstream(), candidates: [{ ...upstream().candidates[0], content: { parts: [{ text: 'not JSON' }] } }] }, 'NEWS_FORMAT'],
  ['ungrounded', { candidates: [{ content: { parts: [{ text: '[]' }] } }] }, 'NEWS_GROUNDING'],
  ['blocked', { promptFeedback: { blockReason: 'SAFETY' } }, 'NEWS_BLOCKED'],
  ['empty', upstream([]), 'NEWS_EMPTY'],
]) {
  test(`${label} news returns a safe non-cacheable validation failure`, async t => {
    const { user, calls } = await fixture(t, { generate: async () => output });
    const client = user();
    await client.request('connect', { key: 'parse-key' });
    assert.equal((await client.request('news')).body.error.kind, kind);
    assert.equal((await client.request('news')).body.error.kind, kind);
    assert.equal(calls.length, 2); // Two explicit requests; no failures cached.
  });
}

test('shared parser preserves UTF-8 per-story citations while filtering unsafe links and duplicates', () => {
  const first = { title: 'Café announces [a plan]', description: 'The café said "new rules" are coming.' };
  const second = { title: 'Another policy', description: 'Another organisation announced changes.' };
  const items = [first, second, { title: ' ', description: 'blank' }, { ...first, title: first.title.toUpperCase() }];
  const text = `Before [1].\n\`\`\`json\n${JSON.stringify(items)}\n\`\`\`\nAfter [2].`;
  const position = item => {
    const raw = JSON.stringify(item), start = text.indexOf(raw);
    return { startIndex: new TextEncoder().encode(text.slice(0, start)).length, endIndex: new TextEncoder().encode(text.slice(0, start + raw.length)).length };
  };
  const result = parseGroundedNews({ candidates: [{ content: { parts: [{ text }] }, groundingMetadata: {
    groundingChunks: [{ web: { uri: 'https://example.com/first', title: 'First' } }, { web: { uri: 'https://example.com/second', title: 'Second' } }, { web: { uri: 'javascript:alert(1)', title: 'Unsafe' } }],
    groundingSupports: [{ segment: position(first), groundingChunkIndices: [0, 2] }, { segment: position(second), groundingChunkIndices: [1] }],
  } }] });
  assert.equal(result.stories.length, 2);
  assert.deepEqual(result.stories.map(item => item.sources.map(s => s.title)), [['First'], ['Second']]);
});

test('structured failures never infer access or quota from incidental provider prose', () => {
  for (const code of [400, 500, 502, 503]) {
    const issue = describeNewsError(new Error(JSON.stringify({ error: { code, status: 'PROVIDER_ERROR', message: '403 no key, 429 billing quota' } })));
    assert.equal(issue.code, 'service');
    assert.equal(issue.action, 'retry');
  }
});

test('installed SDK news request uses grounding, no hidden retries, normalized payload and a real abort deadline', async t => {
  let requests = 0, timeout = false;
  const { user } = await fixture(t, { newsTimeoutMs: 30, createClient: key => new GoogleGenAI({ apiKey: key, httpOptions: {
    fetch: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      if (request.method === 'GET') return new Response(JSON.stringify({ models: [] }), { headers: { 'Content-Type': 'application/json' } });
      requests++;
      const body = await request.json();
      assert.deepEqual(body.tools, [{ googleSearch: {} }]);
      if (timeout) await new Promise((_, reject) => {
        if (request.signal.aborted) reject(request.signal.reason);
        else request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true });
      });
      return new Response(JSON.stringify(upstream()), { headers: { 'Content-Type': 'application/json' } });
    },
  } }) });
  const client = user();
  await client.request('connect', { key: 'sdk-news-key' });
  assert.equal((await client.request('news')).code, 200);
  timeout = true;
  assert.equal((await client.request('news', { forceRefresh: true })).code, 504);
  assert.equal(requests, 2);
  assert.equal((await client.request('session', {}, { method: 'DELETE' })).code, 200);
});
