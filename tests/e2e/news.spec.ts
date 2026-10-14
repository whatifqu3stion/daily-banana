import { expect, test, type Page } from '@playwright/test';

const KEY = 'test-news-key-not-a-secret';
const CACHE = 'dailyBanana_news_v2';
const SOURCE = { title: 'Example News', url: 'https://example.com/news/story' };
const STORIES = [{ title: 'Agency announces a new policy', description: 'An agency announced new rules affecting public services.' }];
const SUGGESTIONS = '<div>Google search suggestions <a href="https://www.google.com/search?q=news" target="_blank">Recent news search</a></div>';

function response(items: unknown[] = STORIES, grounded = true) {
  const text = JSON.stringify(items);
  return { candidates: [{ content: { parts: [{ text }] }, ...(grounded ? { groundingMetadata: {
    groundingChunks: [{ web: { uri: SOURCE.url, title: SOURCE.title } }],
    groundingSupports: [{ segment: { startIndex: 0, endIndex: new TextEncoder().encode(text).length }, groundingChunkIndices: [0] }],
    searchEntryPoint: { renderedContent: SUGGESTIONS },
  } } : {}) }] };
}

async function connect(page: Page) {
  await page.getByRole('button', { name: 'Generate Comic Plan' }).click();
  await page.getByRole('button', { name: 'Open API settings', exact: true }).click();
  await page.getByLabel('Google API key', { exact: true }).fill(KEY);
  await page.getByRole('button', { name: 'Connect key', exact: true }).click();
  await expect(page.getByText('Key connected · checked', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close API settings', exact: true }).click();
}

const newsDialog = (page: Page) => page.getByRole('dialog', { name: 'Recent news ideas', exact: true });
const openNews = (page: Page) => page.getByRole('button', { name: 'Get ideas from recent news' }).click();

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

test('missing key explains recovery without API traffic or losing the topic', async ({ page }) => {
  let calls = 0;
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    calls++;
    await route.fulfill({ json: { name: 'models/gemini-2.5-flash' } });
  });
  await page.goto('/');
  await page.getByLabel('Topic', { exact: true }).fill('Keep my idea');
  await openNews(page);
  await expect(newsDialog(page).getByRole('alert')).toContainText('Connect your Google key');
  expect(calls).toBe(0);
  await newsDialog(page).getByRole('button', { name: 'Open API settings', exact: true }).click();
  await expect(newsDialog(page)).not.toBeVisible();
  await expect(page.getByRole('dialog', { name: 'API settings', exact: true })).toBeVisible();
  await page.getByLabel('Google API key', { exact: true }).fill(KEY);
  await page.getByRole('button', { name: 'Connect key', exact: true }).click();
  await expect(page.getByText('Key connected · checked', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close API settings', exact: true }).click();
  await expect(page.getByLabel('Topic', { exact: true })).toHaveValue('Keep my idea');
  expect(calls).toBe(1);
});

for (const width of [1440, 402]) {
  test(`sourced stories, safe suggestions and selection work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    let calls = 0;
    let body: any;
    await page.route('https://generativelanguage.googleapis.com/**', async route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { name: 'models/gemini-2.5-flash' } });
      calls++;
      expect(route.request().headers()['x-goog-api-key']).toBe(KEY);
      body = route.request().postDataJSON();
      await route.fulfill({ json: response() });
    });
    await page.goto('/');
    await connect(page);
    await openNews(page);
    const dialog = newsDialog(page);
    await expect(dialog.getByRole('list', { name: 'Recent news headlines' }).locator('li')).toHaveCount(1);
    await expect(dialog.getByRole('link', { name: /Example News/ })).toHaveAttribute('href', SOURCE.url);
    expect(body.tools).toEqual([{ googleSearch: {} }]);
    expect(JSON.stringify(body)).toContain('past 24 hours');
    const frame = dialog.locator('iframe');
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox');
    await expect(frame).toHaveAttribute('srcdoc', /default-src 'none'/);
    await expect(frame).toHaveAttribute('srcdoc', /script-src 'nonce-[^']+'/);
    expect((await frame.getAttribute('sandbox'))).not.toContain('allow-same-origin');
    await expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(await dialog.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(false);
    await expect(dialog.getByRole('button', { name: 'Close news selector' })).toBeFocused();
    // Data loading must not steal focus; the browser's modal prevents Tab escape.
    for (let step = 0; step < 6; step++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.closest('dialog') !== null)).toBe(true);
    await dialog.getByRole('button', { name: new RegExp(STORIES[0].title) }).click();
    await expect(page.getByLabel('Topic', { exact: true })).toHaveValue(STORIES[0].title);
    await expect(page.locator('#newsContext')).toContainText(STORIES[0].description);
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

for (const status of [429, 403]) {
  test(`Google ${status} shows actionable guidance without retrying`, async ({ page }) => {
    let calls = 0;
    await page.route('https://generativelanguage.googleapis.com/**', async route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { name: 'models/gemini-2.5-flash' } });
      calls++;
      await route.fulfill({ status, json: { error: { code: status, status: status === 429 ? 'RESOURCE_EXHAUSTED' : 'PERMISSION_DENIED', message: 'Google rejected this lookup' } } });
    });
    await page.goto('/');
    await connect(page);
    await openNews(page);
    await expect(newsDialog(page).getByRole('alert')).toContainText(status === 429 ? 'usage limit' : 'API access');
    await expect(newsDialog(page).getByRole('button', { name: 'Open API settings', exact: true })).toBeVisible();
    expect(calls).toBe(1);
  });
}

test('transient failure retries once and explicit refresh preserves results', async ({ page }) => {
  let calls = 0;
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { name: 'models/gemini-2.5-flash' } });
    calls++;
    await route.fulfill(calls === 1
      ? { status: 503, json: { error: { code: 503, status: 'UNAVAILABLE', message: 'Try later' } } }
      : { json: response() });
  });
  await page.goto('/');
  await connect(page);
  await openNews(page);
  await expect(newsDialog(page).locator('li')).toHaveCount(1);
  expect(calls).toBe(2);
  await newsDialog(page).getByRole('button', { name: 'Refresh headlines', exact: true }).click();
  await expect.poll(() => calls).toBe(3);
  await expect(newsDialog(page).locator('li')).toHaveCount(1);
});

test('failed refresh visibly labels saved data and keeps its original timestamp', async ({ page }) => {
  let calls = 0;
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { name: 'models/gemini-2.5-flash' } });
    calls++;
    await route.fulfill(calls === 1 ? { json: response() }
      : { status: 429, json: { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota reached' } } });
  });
  await page.goto('/');
  await connect(page);
  await openNews(page);
  await expect(newsDialog(page).locator('li')).toHaveCount(1);
  const before = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).fetchedAt, CACHE);
  await newsDialog(page).getByRole('button', { name: 'Refresh headlines', exact: true }).click();
  await expect(newsDialog(page).getByRole('status')).toContainText('usage limit');
  await expect(newsDialog(page).getByText('Showing saved headlines from an earlier search.', { exact: false })).toBeVisible();
  await expect(newsDialog(page).locator('li')).toHaveCount(1);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).fetchedAt, CACHE)).toBe(before);
  expect(calls).toBe(2);
});

test('malformed and ungrounded responses explain the issue and allow a manual retry', async ({ page }) => {
  let calls = 0;
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { name: 'models/gemini-2.5-flash' } });
    calls++;
    const data = response(STORIES, calls !== 2);
    if (calls === 1) data.candidates[0].content.parts[0].text = 'No JSON here';
    await route.fulfill({ json: data });
  });
  await page.goto('/');
  await connect(page);
  await openNews(page);
  await expect(newsDialog(page).getByRole('alert')).toContainText('unreadable');
  expect(calls).toBe(1);
  await newsDialog(page).getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(newsDialog(page).getByRole('alert')).toContainText('verify the news sources');
  expect(calls).toBe(2);
  await newsDialog(page).getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(newsDialog(page).locator('li')).toHaveCount(1);
  expect(calls).toBe(3);
});

test('parser filters blanks and duplicates and attributes UTF-8 citations per story', async ({ page }) => {
  await page.goto('/');
  const parsed = await page.evaluate(async () => {
    const path = '/services/newsParsing.ts';
    const { parseGroundedNews } = await import(path);
    const first = { title: 'Café announces [a plan]', description: 'The café said \"new rules\" are coming.' };
    const second = { title: 'A different policy', description: 'Another organisation announced changes.' };
    const items = [first, second, { title: '   ', description: 'blank' }, { ...first, title: first.title.toUpperCase() }];
    const text = `Before [1].\n\`\`\`json\n${JSON.stringify(items)}\n\`\`\`\nAfter [2].`;
    const position = (item: any) => {
      const raw = JSON.stringify(item), start = text.indexOf(raw);
      return { startIndex: new TextEncoder().encode(text.slice(0, start)).length, endIndex: new TextEncoder().encode(text.slice(0, start + raw.length)).length };
    };
    return parseGroundedNews({ candidates: [{ content: { parts: [{ text }] }, groundingMetadata: {
      groundingChunks: [
        { web: { uri: 'https://example.com/first', title: 'First publisher' } },
        { web: { uri: 'https://example.com/second', title: 'Second publisher' } },
        { web: { uri: 'javascript:alert(1)', title: 'Unsafe link' } },
      ],
      groundingSupports: [
        { segment: position(first), groundingChunkIndices: [0, 2] },
        { segment: position(second), groundingChunkIndices: [1] },
        { segment: { startIndex: 0, endIndex: new TextEncoder().encode(text).length }, groundingChunkIndices: [2] },
      ],
    } }] });
  });
  expect(parsed.stories).toHaveLength(2);
  expect(parsed.stories[0].sources).toEqual([{ title: 'First publisher', url: 'https://example.com/first' }]);
  expect(parsed.stories[1].sources).toEqual([{ title: 'Second publisher', url: 'https://example.com/second' }]);
});

for (const kind of ['corrupt', 'old-schema', 'expired', 'future', 'invalid-stories']) {
  test(`cache ignores ${kind} entries and fetches validated replacements`, async ({ page }) => {
    let calls = 0;
    await page.route('https://generativelanguage.googleapis.com/**', async route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { name: 'models/gemini-2.5-flash' } });
      calls++;
      await route.fulfill({ json: response() });
    });
    await page.goto('/');
    await connect(page);
    await page.evaluate(({ kind, key, source }) => {
      const entry = { version: kind === 'old-schema' ? 1 : 2,
        fetchedAt: Date.now() + (kind === 'future' ? 60_000 : kind === 'expired' ? -31 * 60_000 : 0),
        stories: [{ title: 'Cached title', description: 'Cached description', sources: [source] }],
      };
      localStorage.setItem(key, kind === 'corrupt' ? '{broken' : JSON.stringify(kind === 'invalid-stories'
        ? { ...entry, stories: [{ title: { invalid: true }, description: 42 }] } : entry));
    }, { kind, key: CACHE, source: SOURCE });
    await openNews(page);
    await expect(newsDialog(page).locator('li')).toHaveCount(1);
    expect(calls).toBe(1);
  });
}

test('concurrent callers share one lookup and storage failures do not lose results', async ({ page }) => {
  let calls = 0;
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { name: 'models/gemini-2.5-flash' } });
    calls++;
    await route.fulfill({ json: response() });
  });
  await page.goto('/');
  await connect(page);
  const counts = await page.evaluate(async () => {
    const path = '/services/newsService.ts';
    const { getNewsFeed } = await import(path);
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); };
    try { return (await Promise.all([getNewsFeed(), getNewsFeed(), getNewsFeed()])).map((feed: any) => feed.stories.length); }
    finally { Storage.prototype.setItem = original; }
  });
  expect(counts).toEqual([1, 1, 1]);
  expect(calls).toBe(1);
});

test('closing during lookup aborts waiting and a late result cannot overwrite a reopened dialog', async ({ page }) => {
  let calls = 0;
  let release: (() => void) | undefined;
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { name: 'models/gemini-2.5-flash' } });
    calls++;
    const callNumber = calls;
    if (callNumber === 1) await new Promise<void>(resolve => { release = resolve; });
    try { await route.fulfill({ json: response(callNumber === 1 ? [{ title: 'Old late result', description: 'Old result.' }] : STORIES) }); }
    catch { /* The first browser request was cancelled intentionally. */ }
  });
  await page.goto('/');
  await connect(page);
  await openNews(page);
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(newsDialog(page)).not.toBeVisible();
  await expect.poll(() => page.evaluate(async () => {
    const path = '/services/geminiConnection.ts';
    return (await import(path)).isGeminiBusy();
  })).toBe(false);
  await openNews(page);
  await expect(newsDialog(page).getByRole('button', { name: new RegExp(STORIES[0].title) })).toBeVisible();
  release!();
  await expect(newsDialog(page).getByText('Old late result')).toHaveCount(0);
  expect(calls).toBe(2);
});

test('overall timeout releases the connection and offers retry', async ({ page }) => {
  await page.clock.install();
  let pending: (() => void) | undefined;
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { name: 'models/gemini-2.5-flash' } });
    await new Promise<void>(resolve => { pending = resolve; });
    try { await route.abort(); } catch { /* Already aborted by the deadline. */ }
  });
  await page.goto('/');
  await connect(page);
  await openNews(page);
  await expect.poll(() => Boolean(pending)).toBe(true);
  await page.clock.fastForward(30_001);
  await expect(newsDialog(page).getByRole('alert')).toContainText('took too long');
  await expect(newsDialog(page).getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  expect(await page.evaluate(async () => {
    const path = '/services/geminiConnection.ts';
    return (await import(path)).isGeminiBusy();
  })).toBe(false);
  pending!();
});

test('suggestions block provider scripts and reject forged close messages', async ({ page }) => {
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { name: 'models/gemini-2.5-flash' } });
    const data = response();
    data.candidates[0].groundingMetadata!.searchEntryPoint.renderedContent = `${SUGGESTIONS}
      <script>window.providerScriptRan = true;</script>
      <button onclick="window.providerScriptRan = true;">Provider action</button>`;
    await route.fulfill({ json: data });
  });
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
    window.dispatchEvent(new MessageEvent('message', {
      origin: 'null', source: window,
      data: { type: 'daily-banana-news-close', token: nonce },
    }));
    window.dispatchEvent(new MessageEvent('message', {
      origin: 'null', source: iframe.contentWindow!,
      data: { type: 'daily-banana-news-close', token: 'wrong-token' },
    }));
  });
  await expect(dialog).toBeVisible();
  await frame.getByRole('link', { name: 'Recent news search' }).focus();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});
