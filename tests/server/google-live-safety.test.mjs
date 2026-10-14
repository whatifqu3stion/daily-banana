import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ENABLE_LIVE, skipReason, startLiveSession, validImage } from '../live/google-live-session.mjs';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const TAB = '11111111-1111-4111-8111-111111111111';
const body = input => ({
  model: 'gemini-nano-banana-2.1', input,
  response_format: { aspect_ratio: '1:1' },
});

test('live smoke requires both explicit paid approval and a dedicated credential', () => {
  assert.match(skipReason({}), /SKIPPED.*explicitly approve/);
  assert.match(skipReason({ GOOGLE_IMAGE_SMOKE_API_KEY: 'fake-test-key' }), /SKIPPED/);
  assert.match(skipReason({ GOOGLE_IMAGE_SMOKE: 'true', GOOGLE_IMAGE_SMOKE_API_KEY: 'fake-test-key' }), /SKIPPED/);
  assert.match(skipReason({ GOOGLE_IMAGE_SMOKE: ENABLE_LIVE }), /SKIPPED.*missing/);
  assert.match(skipReason({ GOOGLE_IMAGE_SMOKE: ENABLE_LIVE, GOOGLE_IMAGE_SMOKE_API_KEY: ' ' }), /SKIPPED/);
  assert.equal(skipReason({ GOOGLE_IMAGE_SMOKE: ENABLE_LIVE, GOOGLE_IMAGE_SMOKE_API_KEY: 'fake-test-key' }), '');
});

test('live adapter uses production requests, disables SDK retries and caps paid calls at two', async t => {
  const calls = [];
  const session = await startLiveSession('fake-test-key', key => ({
    models: { get: async () => { assert.equal(key, 'fake-test-key'); } },
    interactions: {
      create: async (params, options) => {
        calls.push({ params, options });
        return { status: 'completed', output_image: { data: PNG, mime_type: 'image/png' } };
      },
    },
  }));
  t.after(() => session.close());
  assert.equal((await session.forward('connect', TAB, { key: 'browser-placeholder' })).status, 200);
  assert.equal((await session.forward('interactions', TAB, body([{ type: 'text', text: 'banana' }]))).status, 200);
  assert.equal((await session.forward('interactions', TAB, body([
    { type: 'image', data: PNG, mime_type: 'image/png' }, { type: 'text', text: 'red desk' },
  ]))).status, 200);
  assert.equal((await session.forward('interactions', TAB, body([{ type: 'text', text: 'retry' }]))).status, 502);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(call => call.options), [
    { maxRetries: 0, timeout: 180_000 }, { maxRetries: 0, timeout: 180_000 },
  ]);
  assert.equal(calls.every(call => call.params.store === false), true);
  assert.equal(calls[1].params.input[0].data, PNG);
  assert.equal(session.checks.every(check => Object.values(check).every(Boolean)), true);
  await session.forward('session', TAB);
  assert.equal((await session.forward('interactions', TAB, body([{ type: 'text', text: 'revoked' }]))).status, 401);
});

test('missing-image frontend retry is blocked before another Google call', async t => {
  let paidCalls = 0;
  const session = await startLiveSession('fake-test-key', () => ({
    models: { get: async () => {} },
    interactions: { create: async () => { paidCalls++; return { status: 'completed' }; } },
  }));
  t.after(() => session.close());
  await session.forward('connect', TAB);
  const request = body([{ type: 'text', text: 'banana' }]);
  await session.forward('interactions', TAB, request);
  assert.equal((await session.forward('interactions', TAB, request)).status, 502);
  assert.equal(paidCalls, 1);
  assert.equal(session.checks[0].validBytes, false);
});

test('live bridge redacts echoed credentials and rejects invalid image signatures', async t => {
  const session = await startLiveSession('fake-test-key', () => ({
    models: { get: async () => { throw new Error(JSON.stringify({ error: { code: 403, message: 'fake-test-key' } })); } },
  }));
  t.after(() => session.close());
  const response = await session.forward('connect', TAB);
  assert.equal(response.status, 403);
  assert.equal(response.body.includes('fake-test-key'), false);
  assert.equal(validImage(PNG, 'image/png'), true);
  assert.equal(validImage(PNG, 'image/jpeg'), false);
  assert.equal(validImage('garbage!', 'image/png'), false);
  assert.equal(validImage(undefined, undefined), false);
});

test('default suites exclude live tests; standalone config disables recording and strips the child credential', async () => {
  const normal = await readFile(new URL('../../playwright.config.ts', import.meta.url), 'utf8');
  assert.match(normal, /testDir: '\.\/tests\/e2e'/);
  const live = await readFile(new URL('../../playwright.google-live.config.ts', import.meta.url), 'utf8');
  for (const option of ['trace', 'screenshot', 'video']) assert.match(live, new RegExp(`${option}: 'off'`));
  assert.match(live, /retries: 0/);
  assert.match(live, /repeatEach: 1/);
  assert.match(live, /GOOGLE_IMAGE_SMOKE_API_KEY: ''/);
  assert.match(live, /GOOGLE_IMAGE_SMOKE: ''/);
});
