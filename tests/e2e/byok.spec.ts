import { expect, test, type Page } from '@playwright/test';

const KEY = 'test-personal-key-not-a-secret';
const OTHER_KEY = 'test-replacement-key-not-a-secret';
const IMAGE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const plan = {
  title: 'Personal Edition', premise: 'Automation creates more meetings.',
  summary: 'A banana learns that automation has a downside.',
  panels: [
    { slug: 'start', size: 'medium', comedic_role: 'establish', visual_prompt: 'A banana in a newsroom.', consistency_tags: ['banana'], text_elements: [] },
    { slug: 'end', size: 'large', comedic_role: 'punchline', visual_prompt: 'A banana surrounded by meetings.', consistency_tags: ['banana'], text_elements: [] },
  ],
};
type Call = { endpoint: string; body: any; headers: Record<string, string> };
async function mockBackend(page: Page) {
  const calls: Call[] = [];
  const sessions = new Map<string, string>();
  const direct: string[] = [];
  const control = { rejectReplacement: false, status: 200, mode: 'image', hold: null as Promise<void> | null, ttl: 1_800_000 };
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    direct.push(route.request().url());
    await route.abort();
  });
  await page.route('**/api/gemini/**', async route => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname.split('/').at(-1)!;
    const headers = request.headers();
    const body = request.postData() ? request.postDataJSON() : undefined;
    calls.push({ endpoint, body, headers });
    const tab = headers['x-gemini-tab'];
    if (endpoint === 'connect') {
      if (control.rejectReplacement && body.key === OTHER_KEY) {
        await route.fulfill({ status: 403, json: { error: { status: 'PERMISSION_DENIED', message: 'Invalid API key [redacted]' } } });
      } else {
        sessions.set(tab, body.key);
        await route.fulfill({ json: { connected: true, expiresAt: Date.now() + control.ttl } });
      }
      return;
    }
    if (endpoint === 'session') {
      sessions.delete(tab);
      await route.fulfill({ json: { connected: false } });
      return;
    }
    if (control.hold) await control.hold;
    if (control.status !== 200) {
      await route.fulfill({ status: control.status, json: { error: {
        code: control.status, status: control.status === 429 ? 'RESOURCE_EXHAUSTED' : 'SESSION_EXPIRED',
        message: control.status === 429 ? 'Billing quota exceeded' : 'Your API key session expired. Reconnect in API settings.',
      } } });
    } else if (!sessions.has(tab)) {
      await route.fulfill({ status: 401, json: { error: { message: 'API key session expired' } } });
    } else if (endpoint === 'interactions') {
      await route.fulfill({ json: { status: 'completed', steps: [], output_image: control.mode === 'image' ? { data: IMAGE, mime_type: 'image/png' } : undefined,
        output_text: control.mode === 'refusal' ? 'I cannot generate this image due to content policy.' : '' } });
    } else {
      const prompt = JSON.stringify(body.contents);
      const text = prompt.includes('recent news headlines')
        ? JSON.stringify([{ title: 'News story', description: 'A grounded story.', source_urls: ['https://example.com/story'] }])
        : prompt.includes('Context Explanation') ? 'Factual context.' : JSON.stringify(plan);
      await route.fulfill({ json: { text, candidates: [{ content: { role: 'model', parts: [{ text }] }, groundingMetadata: {
        groundingChunks: [{ web: { uri: 'https://example.com/story', title: 'Example News' } }],
      } }] } });
    }
  });
  return { calls, sessions, control, direct };
}
async function connect(page: Page, key = KEY) {
  await page.getByRole('button', { name: 'Generate Comic Plan' }).click();
  await page.getByRole('button', { name: 'Open API settings', exact: true }).click();
  await page.getByLabel('Google API key', { exact: true }).fill(key);
  await page.getByRole('button', { name: 'Connect key', exact: true }).click();
  await expect(page.getByText('Key connected · checked', { exact: true })).toBeVisible();
}
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.clear()); });

test('no key means no AI traffic; only connection sends a key, and refresh requires reconnection', async ({ page }) => {
  const mock = await mockBackend(page);
  await page.goto('/');
  await expect(page.getByRole('banner').getByRole('button', { name: /API settings|^API$/ })).toHaveCount(0);
  await expect(page.getByRole('main').getByLabel('Google API key', { exact: true })).toHaveCount(0);
  const error = await page.evaluate(async () => {
    const path = '/services/geminiConnection.ts';
    const connection = await import(path);
    try { await connection.generateContent({ model: 'gemini-2.5-flash', contents: 'test' }); }
    catch (error) { return error.message; }
  });
  expect(error).toContain('Connect your Google API key');
  expect(mock.calls).toHaveLength(0);
  await connect(page);
  expect(mock.calls.map(call => call.endpoint)).toEqual(['connect']);
  expect(mock.calls[0].body).toEqual({ key: KEY });
  await expect(page.getByLabel('Google API key', { exact: true })).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, cookies: document.cookie }));
  expect(stored).not.toContain(KEY);
  await page.reload();
  await page.getByRole('button', { name: 'Generate Comic Plan' }).click();
  await expect(page.getByRole('alert')).toContainText('Connect your Google key');
  expect(mock.calls.filter(call => ['content', 'interactions'].includes(call.endpoint))).toHaveLength(0);
  expect(mock.direct).toHaveLength(0);
});

for (const width of [1440, 402]) {
  test(`API settings typography follows the app hierarchy at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const mock = await mockBackend(page);
    mock.control.rejectReplacement = true;
    await page.goto('/');
    await page.getByRole('button', { name: 'Generate Comic Plan' }).click();
    await page.getByRole('button', { name: 'Open API settings', exact: true }).click();
    await page.evaluate(() => document.fonts.ready);
    const dialog = page.getByRole('dialog', { name: 'API settings', exact: true });
    const typography = await dialog.evaluate(element => {
      const style = (selector: string) => {
        const computed = getComputedStyle(element.querySelector(selector)!);
        return { family: computed.fontFamily, size: parseFloat(computed.fontSize), weight: computed.fontWeight };
      };
      return {
        title: style('#api-settings-title'), section: style('#gemini-connection-heading'),
        label: style('label[for="google-api-key"]'), help: style('#key-check-status'),
        input: style('#google-api-key'), action: style('button[type="submit"]'),
        hasOverflow: element.scrollWidth > element.clientWidth,
      };
    });
    expect(typography.title.family).toContain('Special Elite');
    expect(typography.section.family).toContain('Special Elite');
    expect(typography.label.family).toContain('Special Elite');
    expect(typography.title.size).toBeGreaterThan(typography.section.size);
    expect(typography.section.size).toBeGreaterThan(typography.help.size);
    expect(typography.help.family).toContain('Open Sans');
    expect(typography.help.size).toBeGreaterThanOrEqual(16);
    expect(typography.help.weight).toBe('400');
    expect(typography.input.family).toContain('Open Sans');
    expect(typography.action.family).toContain('Open Sans');
    expect(typography.action.weight).toBe('700');
    expect(typography.hasOverflow).toBe(false);
    await dialog.getByLabel('Google API key', { exact: true }).fill(KEY);
    await dialog.getByRole('button', { name: 'Connect key', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: 'Your Google key', exact: true })).toBeVisible();
    const connectedHelp = dialog.getByText('The metadata check confirms credential access only;', { exact: false });
    await expect(connectedHelp).toBeVisible();
    expect(await connectedHelp.evaluate(element => getComputedStyle(element).fontSize)).toBe('16px');
    await dialog.getByRole('button', { name: 'Replace key', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: 'Replace your Google key', exact: true })).toBeVisible();
    await dialog.getByLabel('Google API key', { exact: true }).fill(OTHER_KEY);
    await dialog.getByRole('button', { name: 'Replace key', exact: true }).click();
    await expect(dialog.getByRole('alert')).toBeVisible();
    expect(await dialog.getByRole('alert').evaluate(element => getComputedStyle(element).fontSize)).toBe('16px');
    expect(await dialog.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(false);
  });
}

for (const width of [1440, 402]) {
  test(`API settings preserve inputs and focus outside the workspace at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const mock = await mockBackend(page);
    await page.goto('/');
    await page.getByLabel('Topic', { exact: true }).fill('Keep my comic idea');
    const generate = page.getByRole('button', { name: 'Generate Comic Plan' });
    await generate.focus();
    await page.keyboard.press('Enter');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Your topic and choices will stay right here');
    const bounds = await alert.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.getByRole('button', { name: 'Open API settings', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'API settings', exact: true });
    await dialog.getByLabel('Google API key', { exact: true }).fill('unsaved-key');
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Open API settings', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Open API settings', exact: true }).click();
    await expect(dialog.getByLabel('Google API key', { exact: true })).toHaveValue('');
    await dialog.getByLabel('Google API key', { exact: true }).fill(KEY);
    await dialog.getByRole('button', { name: 'Connect key', exact: true }).click();
    await expect(dialog.getByText('Key connected · checked', { exact: true })).toBeVisible();
    for (let step = 0; step < 10; step++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    }
    await page.getByRole('button', { name: 'Close API settings', exact: true }).click();
    await expect(generate).toBeFocused();
    await expect(page.getByLabel('Topic', { exact: true })).toHaveValue('Keep my comic idea');
    await page.getByLabel('Topic', { exact: true }).fill('');
    await generate.click();
    expect(await page.getByLabel('Topic', { exact: true }).evaluate((element: HTMLTextAreaElement) => element.validity.valueMissing)).toBe(true);
    expect(mock.calls.filter(call => call.endpoint === 'content')).toHaveLength(0);
  });
}

test('planning, panels, edits, context and grounded news all use the same-origin backend without key headers', async ({ page }) => {
  const mock = await mockBackend(page);
  await page.goto('/');
  await connect(page);
  await page.getByRole('button', { name: 'Close API settings', exact: true }).click();
  await page.getByLabel('Topic', { exact: true }).fill('Office automation');
  await page.getByRole('button', { name: 'Generate Comic Plan' }).click();
  await expect(page.getByRole('heading', { name: 'Choose Your Story' })).toBeVisible();
  await page.getByRole('button', { name: 'Choose This Story' }).click();
  await expect(page.getByRole('heading', { name: 'Review the first panel' })).toBeVisible();
  await page.getByRole('button', { name: 'Finish the strip' }).click();
  await expect(page.getByRole('heading', { name: 'Personal Edition' })).toBeVisible();
  await page.evaluate(async image => {
    const path = '/services/geminiService.ts';
    const { geminiService } = await import(path);
    await geminiService.generateSingleComicPlan({ topic: 'Office automation', stance: 'critical', comedicStyle: 'irony', illustrationStyle: '', imageModel: 'gemini-nano-banana-2.1', brainstormMode: true }, []);
    await geminiService.refinePanelImage(image, 'bigger desk', 'banana', []);
    await geminiService.generateContextExplainer('Personal Edition', 'Automation creates meetings');
    const newsPath = '/services/newsService.ts';
    await (await import(newsPath)).getTopStories();
  }, IMAGE);
  const calls = mock.calls.filter(call => call.endpoint !== 'connect');
  expect(calls.length).toBeGreaterThanOrEqual(6);
  expect(calls.every(call => !JSON.stringify(call).includes(KEY) && !call.headers['x-goog-api-key'])).toBe(true);
  expect(new Set(mock.calls.map(call => call.headers['x-gemini-tab'])).size).toBe(1);
  expect(calls.filter(call => call.endpoint === 'interactions').every(call => call.body.model === 'gemini-nano-banana-2.1' && call.body.response_format.image_size === '2K')).toBe(true);
  expect(calls.filter(call => call.endpoint === 'content').some(call => call.body.config?.tools?.[0]?.googleSearch)).toBe(true);
  expect(mock.direct).toHaveLength(0);
});

test('failed replacement keeps connection; successful replacement and removal update server session', async ({ page }) => {
  const mock = await mockBackend(page);
  await page.goto('/');
  await connect(page);
  mock.control.rejectReplacement = true;
  await page.getByRole('button', { name: 'Replace key', exact: true }).click();
  await page.getByLabel('Google API key', { exact: true }).fill(OTHER_KEY);
  await page.getByRole('button', { name: 'Replace key', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('That key was not accepted');
  expect([...mock.sessions.values()]).toEqual([KEY]);
  await page.getByRole('button', { name: 'Keep current key' }).click();
  mock.control.rejectReplacement = false;
  await page.getByRole('button', { name: 'Replace key', exact: true }).click();
  await page.getByLabel('Google API key', { exact: true }).fill(OTHER_KEY);
  await page.getByRole('button', { name: 'Replace key', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove key', exact: true })).toBeVisible();
  expect([...mock.sessions.values()]).toEqual([OTHER_KEY]);
  await page.getByRole('button', { name: 'Remove key', exact: true }).click();
  await expect(page.getByText('No key connected', { exact: true })).toBeVisible();
  expect(mock.sessions.size).toBe(0);
});

test('billing errors retain useful UI and an expired server session clears connection', async ({ page }) => {
  const mock = await mockBackend(page);
  await page.goto('/');
  await connect(page);
  mock.control.status = 429;
  await page.getByRole('button', { name: 'Close API settings', exact: true }).click();
  await page.getByLabel('Topic', { exact: true }).fill('Office automation');
  await page.getByRole('button', { name: 'Generate Comic Plan' }).click();
  await expect(page.getByRole('heading', { name: 'Google API usage limit reached' })).toBeVisible();
  await expect(page.getByText(/This is not a problem with your topic/)).toBeVisible();
  await page.getByRole('button', { name: /^API settings/ }).click();
  mock.control.status = 401;
  expect(await page.evaluate(async () => {
    const path = '/services/geminiConnection.ts';
    const connection = await import(path);
    try { await connection.generateContent({ model: 'gemini-2.5-flash', contents: 'test' }); }
    catch (error) { return error.message; }
  })).toContain('session expired');
  await expect(page.getByText('No key connected', { exact: true })).toBeVisible();
});

test('key changes pause during AI calls and resume after completion', async ({ page }) => {
  const mock = await mockBackend(page);
  await page.goto('/');
  await connect(page);
  let release!: () => void;
  mock.control.hold = new Promise<void>(resolve => { release = resolve; });
  await page.evaluate(async () => {
    const path = '/services/geminiConnection.ts';
    const connection = await import(path);
    void connection.generateContent({ model: 'gemini-2.5-flash', contents: 'test' });
  });
  await expect(page.getByRole('button', { name: 'Replace key', exact: true })).toBeDisabled();
  expect(await page.evaluate(async () => {
    const path = '/services/geminiConnection.ts';
    const connection = await import(path);
    try { await connection.disconnectGeminiKey(); }
    catch (error) { return error.message; }
  })).toContain('Wait for the current AI request');
  release();
  await expect(page.getByRole('button', { name: 'Remove key', exact: true })).toBeEnabled();
});

test('image models preserve aspect ratio, tagged references and legacy resolution; refusal and empty-output handling remain bounded', async ({ page }) => {
  const mock = await mockBackend(page);
  await page.goto('/');
  await connect(page);
  const run = (model: string, refine = false) => page.evaluate(async ({ image, model, refine }) => {
    const path = '/services/geminiService.ts';
    const { geminiService } = await import(path);
    const refs = [{ base64: image, mimeType: 'image/webp', tag: 'Character sheet: newsroom banana' }];
    try {
      if (refine) return await geminiService.refinePanelImage(image, 'Bigger desk', 'A banana', ['banana'], undefined, undefined, refs, model, undefined, '16:9');
      return await geminiService.generatePanelImageWithReferences('A banana', ['banana'], undefined, undefined, refs, model, undefined, '16:9');
    } catch (error) { return error.message; }
  }, { image: IMAGE, model, refine });
  for (const model of ['gemini-nano-banana-2.1', 'gemini-2.5-flash-image']) {
    await run(model);
    await run(model, true);
    const calls = mock.calls.filter(call => call.endpoint === 'interactions' && call.body.model === model);
    for (const call of calls) {
      expect(call.body.response_format.aspect_ratio).toBe('16:9');
      expect(call.body.response_format.image_size).toBe(model.endsWith('flash-image') ? undefined : '2K');
      expect(call.body.input.slice(-2)).toEqual([{ type: 'text', text: 'Character sheet: newsroom banana' }, { type: 'image', data: IMAGE, mime_type: 'image/webp' }]);
    }
    expect(calls[1].body.input[0]).toEqual({ type: 'image', data: IMAGE, mime_type: 'image/png' });
  }
  for (const [mode, count] of [['refusal', 1], ['empty', 3]] as const) {
    mock.control.mode = mode;
    const before = mock.calls.length;
    const result = await run('gemini-nano-banana-2.1');
    expect(result).toContain(mode === 'refusal' ? 'declined' : 'multiple attempts');
    expect(mock.calls.length - before).toBe(count);
    expect(result).not.toContain(KEY);
  }
});
