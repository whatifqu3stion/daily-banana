import { expect, test, type Page } from '@playwright/test';

const KEY = 'test-news-key-not-a-secret';
const CACHE = 'dailyBanana_news_v3';
const SOURCE = { title: 'Example News', url: 'https://example.com/news/story' };
const STORIES = [{ title: 'Agency announces a new policy', description: 'An agency announced new rules affecting public services.', sources: [SOURCE] }];
const SUGGESTIONS = '<div>Google search suggestions <a href="https://www.google.com/search?q=news" target="_blank">Recent news search</a></div>';
const feed = (stories = STORIES) => ({ stories, fetchedAt: Date.now(), searchSuggestions: SUGGESTIONS });
const newsDialog = (page: Page) => page.getByRole('dialog', { name: 'Recent news ideas', exact: true });
const openNews = (page: Page) => page.getByRole('button', { name: 'Get ideas from recent news' }).click();

async function connect(page: Page) {
  await page.getByRole('button', { name: 'Generate Comic Plan' }).click();
  await page.getByRole('button', { name: 'Open API settings', exact: true }).click();
  await page.getByLabel('Google API key', { exact: true }).fill(KEY);
  await page.getByRole('button', { name: 'Connect key', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Connect your Google Key', exact: true })).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.route('**/api/gemini/connect', route => route.fulfill({ json: { connected: true, expiresAt: Date.now() + 1_800_000 } }));
  await page.route('**/api/gemini/session', route => route.fulfill({ json: { connected: false } }));
  await page.route('https://generativelanguage.googleapis.com/**', route => route.abort());
  // News must not silently fall back to the old generic content proxy.
  await page.route('**/api/gemini/content', route => route.fulfill({ status: 500, json: { error: { code: 500, message: 'Unexpected generic content call' } } }));
});

for (const width of [1440, 402]) {
  test(`headlines without a key opens API entry directly and preserves setup at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    const calls: string[] = [];
    await page.route('**/api/gemini/**', async route => {
      calls.push(new URL(route.request().url()).pathname);
      await route.fallback();
    });
    await page.route('**/api/gemini/news', route => { calls.push('/api/gemini/news'); return route.fulfill({ json: feed() }); });
    await page.goto('/');
    await page.getByLabel('Topic', { exact: true }).fill('Keep my idea');
    await page.getByRole('button', { name: '+ Add background context', exact: true }).click();
    await page.getByLabel('Background Context', { exact: false }).fill('Keep my background facts.');
    const setup = await page.evaluate(() => localStorage.getItem('dailyBanana_formState'));
    const trigger = page.getByRole('button', { name: /Get ideas from recent news/ });
    await openNews(page);
    const dialog = page.getByRole('dialog', { name: 'Connect your Google Key', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Google API key', { exact: true })).toBeVisible();
    await expect(newsDialog(page)).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(calls).toEqual([]);
    expect(await dialog.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(false);
    if (width === 402) await dialog.getByRole('button', { name: 'Close API settings' }).click();
    else await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => localStorage.getItem('dailyBanana_formState'))).toBe(setup);
    await openNews(page);
    await dialog.getByLabel('Google API key', { exact: true }).fill(KEY);
    await dialog.getByRole('button', { name: 'Connect key', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.getByLabel('Topic', { exact: true })).toHaveValue('Keep my idea');
    await expect(page.getByLabel('Background Context', { exact: false })).toHaveValue('Keep my background facts.');
    expect(await page.evaluate(() => localStorage.getItem('dailyBanana_formState'))).toBe(setup);
    expect(calls).toEqual(['/api/gemini/connect']);
    await openNews(page);
    await expect(newsDialog(page).getByRole('list', { name: 'Recent news headlines' }).locator('li')).toHaveCount(1);
    expect(calls).toEqual(['/api/gemini/connect', '/api/gemini/news']);
  });
}

for (const width of [1440, 402]) {
  test(`sourced stories, cached reuse, safe suggestions and selection work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    let calls = 0;
    await page.route('**/api/gemini/news', async route => {
      calls++;
      expect(route.request().postDataJSON()).toEqual({ forceRefresh: false });
      expect(route.request().headers()['x-goog-api-key']).toBeUndefined();
      expect(route.request().postData()).not.toContain(KEY);
      await route.fulfill({ json: feed() });
    });
    await page.goto('/');
    await connect(page);
    await openNews(page);
    const dialog = newsDialog(page);
    await expect(dialog.getByRole('list', { name: 'Recent news headlines' }).locator('li')).toHaveCount(1);
    await expect(dialog.getByRole('link', { name: /Example News/ })).toHaveAttribute('href', SOURCE.url);
    const frame = dialog.locator('iframe');
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox');
    await expect(frame).toHaveAttribute('srcdoc', /default-src 'none'/);
    await expect(frame).toHaveAttribute('srcdoc', /script-src 'nonce-[^']+'/);
    await expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(await dialog.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(false);
    await expect(dialog.getByRole('button', { name: 'Close news selector' })).toBeFocused();
    for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.closest('dialog') !== null)).toBe(true);
    await dialog.getByRole('button', { name: new RegExp(STORIES[0].title) }).click();
    await expect(page.getByLabel('Topic', { exact: true })).toHaveValue(STORIES[0].title);
    await expect(page.locator('#newsContext')).toHaveValue(new RegExp(SOURCE.url));
    await openNews(page);
    await expect(newsDialog(page).locator('li')).toHaveCount(1);
    expect(calls).toBe(1);
    await newsDialog(page).frameLocator('iframe').getByRole('link', { name: 'Recent news search' }).focus();
    await page.keyboard.press('Escape');
    await expect(newsDialog(page)).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Get ideas from recent news' })).toBeFocused();
  });
}

for (const [code, kind, status, expected, settings] of [
  [429, 'GOOGLE_UPSTREAM_ERROR', 'RESOURCE_EXHAUSTED', 'usage limit', true],
  [403, 'GOOGLE_UPSTREAM_ERROR', 'PERMISSION_DENIED', 'API access', true],
  [401, '', '', 'Reconnect your Google key', true],
  [504, 'GENERATION_TIMEOUT', 'DEADLINE_EXCEEDED', 'took too long', false],
  [502, 'GENERATION_UNKNOWN', 'UNCLASSIFIED_FAILURE', 'temporarily unavailable', false],
  [502, 'GENERATION_NETWORK', 'CONNECTION_FAILED', 'Could not reach Google news search', false],
  [502, 'APP_RESPONSE_INVALID', '', 'Could not reach the news desk', false],
  [502, 'NEWS_FORMAT', 'INVALID_NEWS_RESPONSE', 'unreadable headlines', false],
  [502, 'NEWS_GROUNDING', 'INVALID_NEWS_RESPONSE', 'verify the news sources', false],
] as const) {
  test(`news error ${code} ${kind} is actionable without automatic retry or message-number misclassification`, async ({ page }) => {
    let calls = 0;
    await page.route('**/api/gemini/news', async route => {
      calls++;
      await route.fulfill({ status: code, json: { error: { code, kind, status, message: 'Diagnostic 403; no key; billing 429 are incidental prose, not status fields.' } } });
    });
    await page.goto('/');
    await connect(page);
    await openNews(page);
    await expect(newsDialog(page).getByRole('alert')).toContainText(expected);
    await expect(newsDialog(page).getByRole('button', { name: 'Open API settings', exact: true })).toHaveCount(settings ? 1 : 0);
    expect(calls).toBe(1);
    if (kind === 'GENERATION_TIMEOUT') await newsDialog(page).screenshot({ path: '/tmp/news-timeout-recovery.png' });
  });
}

test('transient failure requires an explicit retry; refresh preserves results', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/gemini/news', async route => {
    calls++;
    expect(route.request().postDataJSON()).toEqual({ forceRefresh: calls > 1 });
    await route.fulfill(calls === 1 ? { status: 503, json: { error: { code: 503, status: 'UNAVAILABLE' } } } : { json: feed() });
  });
  await page.goto('/');
  await connect(page);
  await openNews(page);
  await expect(newsDialog(page).getByRole('alert')).toContainText('temporarily unavailable');
  expect(calls).toBe(1);
  await newsDialog(page).getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(newsDialog(page).locator('li')).toHaveCount(1);
  expect(calls).toBe(2);
  await newsDialog(page).getByRole('button', { name: 'Refresh headlines', exact: true }).click();
  await expect.poll(() => calls).toBe(3);
});

test('failed refresh labels saved data without changing its timestamp', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/gemini/news', async route => {
    calls++;
    await route.fulfill(calls === 1 ? { json: feed() } : { status: 429, json: { error: { code: 429, status: 'RESOURCE_EXHAUSTED' } } });
  });
  await page.goto('/');
  await connect(page);
  await openNews(page);
  await expect(newsDialog(page).locator('li')).toHaveCount(1);
  const before = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).fetchedAt, CACHE);
  await newsDialog(page).getByRole('button', { name: 'Refresh headlines', exact: true }).click();
  await expect(newsDialog(page).getByRole('status')).toContainText('usage limit');
  await expect(newsDialog(page).getByText('Showing saved headlines from an earlier search.', { exact: false })).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).fetchedAt, CACHE)).toBe(before);
  expect(calls).toBe(2);
});

for (const kind of ['corrupt', 'old-schema', 'expired', 'future', 'invalid-stories']) {
  test(`cache ignores ${kind} entries`, async ({ page }) => {
    let calls = 0;
    await page.route('**/api/gemini/news', route => { calls++; return route.fulfill({ json: feed() }); });
    await page.goto('/');
    await connect(page);
    await openNews(page);
    await expect(newsDialog(page).locator('li')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await page.evaluate(({ kind, key }) => {
      const entry = JSON.parse(localStorage.getItem(key)!);
      if (kind === 'old-schema') entry.version = 2;
      if (kind === 'expired') entry.fetchedAt = Date.now() - 31 * 60_000;
      if (kind === 'future') entry.fetchedAt = Date.now() + 60_000;
      if (kind === 'invalid-stories') entry.stories = [{ title: { invalid: true }, description: 42 }];
      localStorage.setItem(key, kind === 'corrupt' ? '{broken' : JSON.stringify(entry));
    }, { kind, key: CACHE });
    await openNews(page);
    await expect(newsDialog(page).locator('li')).toHaveCount(1);
    expect(calls).toBe(2);
  });
}

test('concurrent callers share one lookup and storage failure does not lose results', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/gemini/news', route => { calls++; return route.fulfill({ json: feed() }); });
  await page.goto('/');
  await connect(page);
  const counts = await page.evaluate(async () => {
    const path = '/services/newsService.ts';
    const { getNewsFeed } = await import(path);
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); };
    try { return (await Promise.all([getNewsFeed(), getNewsFeed(), getNewsFeed()])).map(feed => feed.stories.length); }
    finally { Storage.prototype.setItem = original; }
  });
  expect(counts).toEqual([1, 1, 1]);
  expect(calls).toBe(1);
});

test('closing aborts waiting; a late result cannot overwrite the reopened dialog', async ({ page }) => {
  let calls = 0;
  let release!: () => void;
  await page.route('**/api/gemini/news', async route => {
    const number = ++calls;
    if (number === 1) await new Promise<void>(resolve => { release = resolve; });
    try { await route.fulfill({ json: feed(number === 1 ? [{ ...STORIES[0], title: 'Old late result' }] : STORIES) }); } catch {}
  });
  await page.goto('/');
  await connect(page);
  await openNews(page);
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(newsDialog(page)).not.toBeVisible();
  await openNews(page);
  await expect(newsDialog(page).getByRole('button', { name: new RegExp(STORIES[0].title) })).toBeVisible();
  release();
  await expect(newsDialog(page).getByText('Old late result')).toHaveCount(0);
  expect(calls).toBe(2);
});

test('transport deadline releases the connection and offers manual retry', async ({ page }) => {
  await page.clock.install();
  let release!: () => void;
  await page.route('**/api/gemini/news', async route => {
    await new Promise<void>(resolve => { release = resolve; });
    try { await route.abort(); } catch {}
  });
  await page.goto('/');
  await connect(page);
  await openNews(page);
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.clock.fastForward(30_001);
  await expect(newsDialog(page).getByRole('alert')).toContainText('took too long');
  await expect(newsDialog(page).getByRole('alert')).toContainText('browser-to-app waiting limit');
  await expect(newsDialog(page).getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  expect(await page.evaluate(async () => {
    const path = '/services/geminiConnection.ts';
    return (await import(path)).isGeminiBusy();
  })).toBe(false);
  release();
});

test('key replacement invalidates browser cache scope', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/gemini/news', route => { calls++; return route.fulfill({ json: feed() }); });
  await page.goto('/');
  await connect(page);
  await openNews(page);
  await expect(newsDialog(page).locator('li')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.evaluate(async () => {
    const path = '/services/geminiConnection.ts';
    await (await import(path)).connectGeminiKey('replacement-news-key');
  });
  await openNews(page);
  await expect(newsDialog(page).locator('li')).toHaveCount(1);
  expect(calls).toBe(2);
});

test('suggestions block scripts and reject forged close messages', async ({ page }) => {
  await page.route('**/api/gemini/news', route => route.fulfill({ json: { ...feed(), searchSuggestions: `${SUGGESTIONS}<script>window.providerScriptRan=true;</script><button onclick="window.providerScriptRan=true;">Provider action</button>` } }));
  await page.goto('/');
  await connect(page);
  await openNews(page);
  const dialog = newsDialog(page);
  await expect(dialog.locator('li')).toHaveCount(1);
  const frame = dialog.frameLocator('iframe');
  await frame.getByRole('button', { name: 'Provider action' }).click();
  expect(await frame.locator('body').evaluate(() => Boolean((window as any).providerScriptRan))).toBe(false);
  await dialog.evaluate(element => {
    const iframe = element.querySelector('iframe')!;
    const nonce = iframe.srcdoc.match(/script-src 'nonce-([^']+)'/)![1];
    window.dispatchEvent(new MessageEvent('message', { origin: 'null', source: window, data: { type: 'daily-banana-news-close', token: nonce } }));
    window.dispatchEvent(new MessageEvent('message', { origin: 'null', source: iframe.contentWindow!, data: { type: 'daily-banana-news-close', token: 'wrong-token' } }));
  });
  await expect(dialog).toBeVisible();
  await frame.getByRole('link', { name: 'Recent news search' }).focus();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});
