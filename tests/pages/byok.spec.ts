import { test, expect, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
const screenshotDir = process.env.PORTFOLIO_SCREENSHOTS;
async function capture(page: Page, name: string) {
  if (!screenshotDir) return;
  await mkdir(screenshotDir, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${screenshotDir}/${name}.png`, fullPage: true });
}

test.beforeEach(async ({ page }) => {
  if (!process.env.PORTFOLIO_FONTS) return;
  const dir = process.env.PORTFOLIO_FONTS;
  const files = JSON.parse(await readFile(`${dir}/manifest.json`, 'utf8'));
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ path: `${dir}/fonts.css`, contentType: 'text/css' }));
  await page.route('https://fonts.gstatic.com/**', route => {
    const path = files[route.request().url()];
    return path ? route.fulfill({ path, contentType: 'font/ttf' }) : route.abort();
  });
});

const key = 'portfolio-test-key-not-a-credential';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
// Scripted story, not evidence of model quality. Real SDK and production build.
const plan = {
  title: 'The Peel Deal', summary: 'An ambitious banana automates its work and accidentally automates the bureaucracy too.',
  premise: 'Every productivity shortcut creates two more meetings.',
  set_description: 'Newsroom: deadline clock on the left wall and yellow filing cabinet by the desk.',
  numeric_uses: [],
  story: { source_anchor: 'Fictional office automation', source_excerpt: '', source_panel_slug: 'shortcut',
    satirical_argument: 'Automation expands bureaucracy instead of removing it.', setup: 'A reporter automates work.',
    payoff: 'Meetings multiply.', review_notes: [] },
  panels: [
    { slug: 'shortcut', action: { id: 'press', description: 'Press the automation button.', before: 'Reporter at the desk.', after: 'Automation is running.' },
      comedic_role: 'establish', visual_prompt: 'A banana reporter presses an automate button.',
      text_elements: [{ role: 'speech', text: 'I automated everything!' }], consistency_tags: ['banana reporter', 'blue tie'],
      size: 'medium', aspect_ratio: '1:1', scene_state: 'Reporter at the desk. Automation running.' },
    { slug: 'meetings', action: { id: 'react', description: 'React to multiplying meetings.', before: 'Automation running.', after: 'Reporter surrounded by meeting invitations.' },
      comedic_role: 'punchline', visual_prompt: 'Calendar invitations pour from a printer.',
      text_elements: [{ role: 'speech', text: 'Including the meetings?' }], consistency_tags: ['banana reporter', 'blue tie'],
      size: 'medium', aspect_ratio: '1:1', scene_state: 'Reporter surrounded by meeting invitations.' },
  ],
};

async function connect(page: Page) {
  await page.getByRole('button', { name: 'Generate Comic Plan' }).click();
  await page.getByRole('button', { name: 'Open API settings', exact: true }).click();
  await page.getByLabel('Google API key', { exact: true }).fill(key);
  await page.getByRole('button', { name: 'Connect key', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('Pages BYOK uses Google directly, completes the flow and forgets the key on refresh', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 960 });
  const calls: { url: string; body: any }[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const backend: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/gemini/')) backend.push(request.url()); });
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    const request = route.request();
    const body = request.method() === 'POST' ? request.postDataJSON() : null;
    calls.push({ url: request.url(), body });
    const headers = await request.allHeaders();
    expect(headers['x-goog-api-key'] || new URL(request.url()).searchParams.get('key')).toBe(key);
    if (request.method() === 'GET') return route.fulfill({ json: { models: [{ name: 'models/gemini-2.5-flash' }] } });
    if (request.url().includes('generateContent')) return route.fulfill({ json: {
      candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify(plan) }] } }],
    } });
    return route.fulfill({ json: { id: 'fixture', status: 'completed', steps: [
      { type: 'model_output', content: [{ type: 'image', data: png, mime_type: 'image/png' }] },
    ] } });
  });
  await page.goto('./');
  await expect(page).toHaveTitle(/Daily Banana/);
  await expect(page.locator('h1')).toHaveText('The Daily Banana');
  expect(await page.locator('header img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(calls).toHaveLength(0);
  await page.getByLabel('Topic', { exact: true }).fill('Office automation gone wrong');
  await capture(page, '01-setup');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await capture(page, '02-setup-mobile');
  await page.setViewportSize({ width: 1280, height: 960 });
  await connect(page);
  expect(calls).toHaveLength(1); // Key check generates no content.
  await page.getByRole('button', { name: 'Generate Comic Plan' }).click();
  await expect(page.getByRole('heading', { name: 'Choose Your Story' })).toBeVisible();
  await capture(page, '03-story-choice');
  await page.getByRole('button', { name: 'Choose This Story' }).click();
  await expect(page.getByRole('heading', { name: 'Review the first panel' })).toBeVisible();
  await page.getByRole('button', { name: 'Finish the strip' }).click();
  await expect(page.getByText('Final edition')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeEnabled();
  expect(calls.filter(call => call.url.includes('/interactions'))).toHaveLength(2);
  expect(backend).toEqual([]);
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie }));
  expect(storage).not.toContain(key);
  await page.reload();
  await page.getByRole('button', { name: 'Generate Comic Plan' }).click();
  await expect(page.getByRole('button', { name: 'Open API settings', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a rejected replacement preserves the working key; removal and expiry revoke it', async ({ page }) => {
  await page.clock.install();
  let rejectNext = false;
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    if (rejectNext) return route.fulfill({ status: 403, json: { error: { code: 403, message: 'Website blocked',
      details: [{ reason: 'API_KEY_HTTP_REFERRER_BLOCKED' }] } } });
    return route.fulfill({ json: { models: [] } });
  });
  await page.goto('./');
  await connect(page);
  await page.getByRole('button', { name: /API settings. Connected/ }).click();
  await page.getByRole('button', { name: 'Replace key', exact: true }).click();
  rejectNext = true;
  await page.getByLabel('Google API key', { exact: true }).fill('rejected-test-key');
  await page.getByRole('button', { name: 'Replace key', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Google blocked this website');
  await page.getByRole('button', { name: 'Keep current key' }).click();
  await expect(page.getByText('Key connected · checked')).toBeVisible();
  await page.getByRole('button', { name: 'Remove key', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Connect key', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close API settings' }).click();
  rejectNext = false;
  await connect(page);
  await page.clock.fastForward(30 * 60 * 1000 + 100);
  await page.getByRole('button', { name: 'Generate Comic Plan' }).click();
  await expect(page.getByRole('button', { name: 'Open API settings', exact: true })).toBeVisible();
});

test('Pages headlines retain sources, reuse the cache and populate the brief', async ({ page }) => {
  let searches = 0;
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { models: [] } });
    searches++;
    const body = route.request().postDataJSON();
    expect(body.tools).toEqual([{ googleSearch: {} }]);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 1024 });
    expect((await route.request().allHeaders())['x-server-timeout']).toBe('60');
    return route.fulfill({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify([
      { title: 'Agency announces a new policy', description: 'An agency announced new rules affecting public services.', source_urls: ['https://example.com/news/story'] },
    ]) }] }, groundingMetadata: { groundingChunks: [{ web: { uri: 'https://example.com/news/story', title: 'Example News' } }] } }] } });
  });
  await page.goto('./');
  await connect(page);
  await page.getByRole('button', { name: 'Get ideas from recent news' }).click();
  const dialog = page.getByRole('dialog', { name: 'Recent news ideas', exact: true });
  await expect(dialog.getByRole('link', { name: /Example News/ })).toHaveAttribute('href', 'https://example.com/news/story');
  const timing = await page.evaluate(() => {
    const entry = performance.getEntriesByName('daily-banana:news-lookup')[0] as PerformanceMeasure;
    return { duration: entry.duration, detail: entry.detail };
  });
  expect(timing.duration).toBeGreaterThanOrEqual(0);
  expect(timing.detail).toEqual({ outcome: 'success', transport: 'browser' });
  await dialog.getByRole('button', { name: /Agency announces a new policy/ }).click();
  await expect(page.getByLabel('Topic', { exact: true })).toHaveValue('Agency announces a new policy');
  await expect(page.locator('#newsContext')).toHaveValue(/https:\/\/example.com\/news\/story/);
  await page.getByRole('button', { name: 'Get ideas from recent news' }).click();
  await expect(dialog.getByRole('list', { name: 'Recent news headlines' }).locator('li')).toHaveCount(1);
  expect(searches).toBe(1);
});

const newsReply = () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify([
  { title: 'A sourced news fixture', description: 'A short factual snippet.', source_urls: ['https://example.com/news/recovery'] },
]) }] }, groundingMetadata: { groundingChunks: [{ web: { uri: 'https://example.com/news/recovery', title: 'Example News' } }] } }] });
const newsDialog = (page: Page) => page.getByRole('dialog', { name: 'Recent news ideas', exact: true });

test('Pages news can finish after the former 20-second cutoff', async ({ page }) => {
  await page.clock.install();
  let release!: () => void;
  let searches = 0;
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { models: [] } });
    searches++;
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ json: newsReply() });
  });
  await page.goto('./');
  await connect(page);
  await page.getByRole('button', { name: 'Get ideas from recent news' }).click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.clock.fastForward(25_000);
  await expect(newsDialog(page).getByRole('status')).toContainText('This can take up to a minute');
  await expect(newsDialog(page).getByRole('alert')).toHaveCount(0);
  release();
  await expect(newsDialog(page).getByRole('link', { name: /Example News/ })).toBeVisible();
  expect(searches).toBe(1);
});

for (const deadlineSource of ['app', 'sdk']) test(`Pages ${deadlineSource} deadline shows recovery and retries only on an explicit click`, async ({ page }) => {
  await page.setViewportSize({ width: deadlineSource === 'sdk' ? 390 : 1280, height: 960 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install();
  let release!: () => void;
  let searches = 0;
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { models: [] } });
    searches++;
    if (searches === 1) {
      await new Promise<void>(resolve => { release = resolve; });
      await route.abort().catch(() => {});
    } else await route.fulfill({ json: newsReply() });
  });
  await page.goto('./');
  await connect(page);
  if (deadlineSource === 'sdk') {
    // Hold the app's deadline to exercise the SDK's own HTTP timer winning.
    // The SDK still receives its real timeout option and caller signal.
    await page.evaluate(() => { AbortSignal.timeout = () => new AbortController().signal; });
  }
  await page.getByRole('button', { name: 'Get ideas from recent news' }).click();
  await expect.poll(() => Boolean(release)).toBe(true);
  // Both abort paths use the installed SDK; virtual time avoids a paid call
  // and a minute-long test while preserving the timeout versus close behavior.
  await page.clock.fastForward(60_001);
  const dialog = newsDialog(page);
  await expect(dialog.getByRole('alert')).toContainText('News search took too long');
  await expect(dialog.getByRole('alert')).toContainText("app's 60-second waiting limit");
  await expect(dialog.getByRole('button', { name: 'Try again', exact: true })).toBeEnabled();
  expect(searches).toBe(1);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await capture(page, `news-${deadlineSource}-timeout-recovery`);
  release();
  await dialog.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(dialog.getByRole('link', { name: /Example News/ })).toBeVisible();
  expect(searches).toBe(2);
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Pages preserves a Google-reported deadline and offers manual retry without hidden calls', async ({ page }) => {
  let searches = 0;
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { models: [] } });
    searches++;
    return searches === 1
      ? route.fulfill({ status: 504, json: { error: { code: 504, status: 'DEADLINE_EXCEEDED', message: 'Fixture provider deadline' } } })
      : route.fulfill({ json: newsReply() });
  });
  await page.goto('./');
  await connect(page);
  await page.getByRole('button', { name: 'Get ideas from recent news' }).click();
  await expect(newsDialog(page).getByRole('alert')).toContainText('News search took too long');
  await expect(newsDialog(page).getByRole('alert')).not.toContainText("app's 60-second waiting limit");
  expect(searches).toBe(1);
  await newsDialog(page).getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(newsDialog(page).getByRole('link', { name: /Example News/ })).toBeVisible();
  expect(searches).toBe(2);
});

test('closing a Pages news lookup stays a cancellation and ignores late results', async ({ page }) => {
  let release!: () => void;
  let searches = 0;
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { models: [] } });
    searches++;
    if (searches === 1) {
      await new Promise<void>(resolve => { release = resolve; });
      await route.fulfill({ json: newsReply() }).catch(() => {});
    } else await route.fulfill({ json: newsReply() });
  });
  await page.goto('./');
  await connect(page);
  await page.getByRole('button', { name: 'Get ideas from recent news' }).click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await newsDialog(page).getByRole('button', { name: 'Close news selector' }).click();
  await expect(newsDialog(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (performance.getEntriesByName('daily-banana:news-lookup')[0] as PerformanceMeasure)?.detail?.outcome)).toBe('cancelled');
  release();
  await page.getByRole('button', { name: 'Get ideas from recent news' }).click();
  await expect(newsDialog(page).getByRole('link', { name: /Example News/ })).toBeVisible();
  await expect(newsDialog(page).getByRole('alert')).toHaveCount(0);
  expect(searches).toBe(2);
});

test('Pages editorial concerns allow choosing, proof changes, finishing and export without approval steps', async ({ page }) => {
  const background = 'Example Bank paid a $1.21 billion fine.';
  const scripted = structuredClone(plan);
  scripted.story = { ...scripted.story, source_anchor: background, source_excerpt: background };
  scripted.panels[0].text_elements = [{ role: 'speech', text: '$12 billion? Again?' }];
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { models: [] } });
    if (route.request().url().includes('generateContent')) return route.fulfill({ json: {
      candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify(scripted) }] } }],
    } });
    return route.fulfill({ json: { id: 'fixture', status: 'completed', steps: [
      { type: 'model_output', content: [{ type: 'image', data: png, mime_type: 'image/png' }] },
    ] } });
  });
  await page.goto('./');
  await page.getByLabel('Topic', { exact: true }).fill('Bank fine');
  await page.getByRole('button', { name: '+ Add background context', exact: true }).click();
  await page.getByLabel('Background Context', { exact: false }).fill(background);
  await connect(page);
  await page.getByRole('button', { name: 'Generate Comic Plan' }).click();
  await expect(page.getByRole('complementary', { name: 'Story concerns' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose This Story' })).toBeEnabled();
  await page.getByRole('button', { name: 'Choose This Story' }).click();
  await expect(page.getByRole('heading', { name: 'Review the first panel' })).toBeVisible();
  await page.getByRole('button', { name: 'Regenerate', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Finish the strip' })).toBeEnabled();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Finish the strip' }).click();
  await expect(page.getByText('Final edition', { exact: true })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Story concerns' })).toHaveCount(1);
  await expect(page.getByTestId('comic-export')).toContainText('$12 billion? Again?');
  await expect(page.getByTestId('comic-export').getByRole('complementary', { name: 'Story concerns' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.mouse.move(0, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
