import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PanelRun } from '../../shared/panel-run.mjs';

test('reproducer: resetting a shared abort flag lets an earlier run write into its replacement', async () => {
  let aborted = false, resolve;
  let results = [];
  const oldWork = new Promise(done => { resolve = done; }).then(image => { if (!aborted) results[0] = image; });
  aborted = true; // old effect cleanup
  aborted = false; results = []; // replacement effect starts
  resolve('OLD_IMAGE');
  await oldWork;
  assert.equal(results[0], 'OLD_IMAGE'); // Demonstrates the old mechanism, not the user's original incident.
});

test('replacement run cannot accept an old late image with the same panel identifier', async () => {
  const old = new PanelRun('old');
  let resolve;
  const result = old.getOrStart('panel-2', () => new Promise(done => { resolve = done; }));
  await Promise.resolve();
  const rejected = assert.rejects(result, /superseded/);
  old.invalidate();
  const next = new PanelRun('new');
  const current = next.getOrStart('panel-2', () => 'NEW_IMAGE');
  resolve('OLD_IMAGE');
  await rejected;
  assert.equal(await current, 'NEW_IMAGE');
  assert.equal(old.entries.size, 0);
});

test('foreground joins a pending background request, preserving one paid call', async () => {
  const run = new PanelRun('version-1');
  let release, count = 0;
  const background = run.getOrStart('throw', () => { count++; return new Promise(resolve => { release = resolve; }); });
  await Promise.resolve();
  run.stopScheduling();
  const foreground = run.getOrStart('throw', () => { count++; return 'DUPLICATE'; });
  assert.equal(background, foreground);
  release('THROW_IMAGE');
  assert.equal(await foreground, 'THROW_IMAGE');
  assert.equal(count, 1);
});

test('failed background work is not silently retried and distinct panel identities remain distinct', async () => {
  const run = new PanelRun('version');
  let count = 0;
  const fail = () => { count++; throw new Error('Google failed'); };
  await assert.rejects(run.getOrStart('crumple', fail), /Google failed/);
  await assert.rejects(run.getOrStart('crumple', fail), /Google failed/);
  assert.equal(count, 1);
  assert.equal(await run.getOrStart('throw', () => 'THROW'), 'THROW');
  run.invalidate();
  await assert.rejects(run.getOrStart('throw', () => 'LATE'), /superseded/);
});
