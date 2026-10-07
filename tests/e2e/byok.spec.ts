import { expect, test, type Page } from '@playwright/test';

const KEY = 'test-personal-key-not-a-secret';
const OTHER_KEY = 'test-replacement-key-not-a-secret';
const IMAGE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const plan = {
  title: 'Personal Edition',
  premise: 'Automation creates more meetings.',
  summary: 'A banana learns that automation has a downside.',
  panels: [
    { slug: 'start', size: 'medium', comedic_role: 'establish', visual_prompt: 'A banana in a newsroom.', consistency_tags: ['banana'], text_elements: [] },
    { slug: 'end', size: 'large', comedic_role: 'punchline', visual_prompt: 'A banana surrounded by meetings.', consistency_tags: ['banana'], text_elements: [] },
  ],
};

async function connect(page: Page, key = KEY) {
  await page.getByRole('button', { name: /^API settings/ }).click();
  await page.getByLabel('Google API key', { exact: true }).fill(key);
  await page.getByRole('button', { name: 'Connect key', exact: true }).click();
  await expect(page.getByText('Key connected · checked', { exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

test('no key means no AI traffic, and the tab never persists credentials', async ({ page }) => {
  let requests = 0;
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    requests++;
    await route.fulfill({ json: { name: 'models/gemini-2.5-flash' } });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Generate Comic Plan' })).toBeDisabled();
  expect(await page.evaluate(async () => {
    const path = '/services/geminiConnection.ts';
    const connection = await import(path);
    try { await connection.generateContent({ model: 'gemini-2.5-flash', contents: 'test' }); }
    catch (error) { return error.message; }
  })).toContain('Connect your Google API key');
  expect(requests).toBe(0);
  await connect(page);
  expect(requests).toBe(1); // metadata only, no paid generation
  const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(stored).not.toContain(KEY);
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'API settings', exact: true })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate Comic Plan' })).toBeDisabled();
  expect(requests).toBe(1);
});

test('all live Gemini paths use the personal key and the stable image model', async ({ page }) => {
  const calls: { key: string | undefined; url: string; body: any }[] = [];
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({ json: { name: 'models/gemini-2.5-flash' } });
      return;
    }
    const body = request.postDataJSON();
    calls.push({ key: request.headers()['x-goog-api-key'], url: request.url(), body });
    const prompt = JSON.stringify(body.contents);
    const text = prompt.includes('top 10 news headlines')
      ? JSON.stringify([{ title: 'News story', description: 'A grounded story.' }])
      : prompt.includes('Context Explanation') ? 'Factual context.' : JSON.stringify(plan);
    await route.fulfill({ json: { candidates: [{ content: { role: 'model', parts: body.generationConfig?.responseModalities?.includes('IMAGE')
      ? [{ inlineData: { data: IMAGE, mimeType: 'image/png' } }] : [{ text }] } }] } });
  });
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

  await page.evaluate(async ({ image }) => {
    const servicePath = '/services/geminiService.ts';
    const { geminiService } = await import(servicePath);
    const form = { topic: 'Office automation', stance: 'critical', comedicStyle: 'irony', illustrationStyle: '', imageModel: 'gemini-nano-banana-2.1', brainstormMode: true };
    await geminiService.generateSingleComicPlan(form, []);
    await geminiService.refinePanelImage(image, 'bigger desk', 'banana', []);
    await geminiService.generateContextExplainer('Personal Edition', 'Automation creates meetings');
    const newsPath = '/services/newsService.ts';
    const { getTopStories } = await import(newsPath);
    await getTopStories();
  }, { image: IMAGE });
  expect(calls.length).toBeGreaterThanOrEqual(6);
  expect(calls.every(call => call.key === KEY)).toBe(true);
  const images = calls.filter(call => call.body.generationConfig?.responseModalities?.includes('IMAGE'));
  expect(images.length).toBeGreaterThanOrEqual(3);
  expect(images.every(call => call.url.includes('gemini-nano-banana-2.1:generateContent'))).toBe(true);
  expect(images.every(call => call.body.generationConfig.imageConfig.imageSize === '2K')).toBe(true);
});

test('failed replacement preserves the working key; removal blocks further AI calls', async ({ page }) => {
  let currentKey = '';
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    const key = route.request().headers()['x-goog-api-key'];
    if (key === OTHER_KEY) {
      await route.fulfill({ status: 400, json: { error: { code: 400, message: `API key not valid: ${OTHER_KEY}`, status: 'INVALID_ARGUMENT' } } });
    } else if (route.request().method() === 'GET') {
      await route.fulfill({ json: { name: 'models/gemini-2.5-flash' } });
    } else {
      currentKey = key ?? '';
      await route.fulfill({ json: { candidates: [{ content: { parts: [{ text: 'ok' }] } }] } });
    }
  });
  await page.goto('/');
  await connect(page);
  await page.getByRole('button', { name: 'Replace key', exact: true }).click();
  await page.getByLabel('Google API key', { exact: true }).fill(OTHER_KEY);
  await page.getByRole('button', { name: 'Replace key', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('That key was not accepted');
  await expect(page.getByRole('alert')).not.toContainText(OTHER_KEY);
  await page.getByRole('button', { name: 'Keep current key' }).click();
  await page.evaluate(async () => {
    const path = '/services/geminiConnection.ts';
    const { generateContent } = await import(path);
    await generateContent({ model: 'gemini-2.5-flash', contents: 'test' });
  });
  expect(currentKey).toBe(KEY);
  await page.getByRole('button', { name: 'Remove key', exact: true }).click();
  await expect(page.getByText('No key connected', { exact: true })).toBeVisible();
  expect(await page.evaluate(async () => {
    const path = '/services/geminiConnection.ts';
    const connection = await import(path);
    try { await connection.generateContent({ model: 'gemini-2.5-flash', contents: 'test' }); }
    catch (error) { return error.message; }
  })).toContain('Connect your Google API key');
});

test('successful replacement routes subsequent calls to the new key', async ({ page }) => {
  let usedKey = '';
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    usedKey = route.request().headers()['x-goog-api-key'] ?? '';
    await route.fulfill({ json: route.request().method() === 'GET' ? { name: 'models/gemini-2.5-flash' }
      : { candidates: [{ content: { parts: [{ text: 'ok' }] } }] } });
  });
  await page.goto('/');
  await connect(page);
  await page.getByRole('button', { name: 'Replace key', exact: true }).click();
  await page.getByLabel('Google API key', { exact: true }).fill(OTHER_KEY);
  await page.getByRole('button', { name: 'Replace key', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove key', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const path = '/services/geminiConnection.ts';
    const { generateContent } = await import(path);
    await generateContent({ model: 'gemini-2.5-flash', contents: 'test' });
  });
  expect(usedKey).toBe(OTHER_KEY);
});

test('quota errors explain Google billing instead of blaming the topic', async ({ page }) => {
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    await route.fulfill(route.request().method() === 'GET' ? { json: { name: 'models/gemini-2.5-flash' } }
      : { status: 429, json: { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' } } });
  });
  await page.goto('/');
  await connect(page);
  await page.getByRole('button', { name: 'Close API settings', exact: true }).click();
  await page.getByLabel('Topic', { exact: true }).fill('Office automation');
  await page.getByRole('button', { name: 'Generate Comic Plan' }).click();
  await expect(page.getByRole('heading', { name: 'Google API usage limit reached' })).toBeVisible();
  await expect(page.getByText(/This is not a problem with your topic/)).toBeVisible();
  await page.getByRole('button', { name: /^API settings/ }).click();
  await expect(page.getByRole('button', { name: 'Replace key', exact: true })).toBeEnabled();
});

test('legacy 2.5 generation omits unsupported resolution settings', async ({ page }) => {
  let imageRequest: any;
  let imageUrl = '';
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { name: 'models/gemini-2.5-flash' } });
      return;
    }
    imageUrl = route.request().url();
    imageRequest = route.request().postDataJSON();
    await route.fulfill({ json: { candidates: [{ content: { parts: [{ inlineData: { data: IMAGE, mimeType: 'image/png' } }] } }] } });
  });
  await page.goto('/');
  await connect(page);
  await page.evaluate(async () => {
    const path = '/services/geminiService.ts';
    const { geminiService } = await import(path);
    await geminiService.generatePanelImageWithReferences('A banana', [], undefined, undefined, [], 'gemini-2.5-flash-image');
  });
  expect(imageUrl).toContain('gemini-2.5-flash-image:generateContent');
  expect(imageRequest.generationConfig.imageConfig).not.toHaveProperty('imageSize');
});

test('key changes are blocked while an AI request is running', async ({ page }) => {
  let release: (() => void) | undefined;
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { name: 'models/gemini-2.5-flash' } });
      return;
    }
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ json: { candidates: [{ content: { parts: [{ text: 'ok' }] } }] } });
  });
  await page.goto('/');
  await connect(page);
  await page.evaluate(async () => {
    const path = '/services/geminiConnection.ts';
    const { generateContent } = await import(path);
    void generateContent({ model: 'gemini-2.5-flash', contents: 'test' });
  });
  await expect(page.getByRole('button', { name: 'Replace key', exact: true })).toBeDisabled();
  expect(await page.evaluate(async () => {
    const path = '/services/geminiConnection.ts';
    const connection = await import(path);
    try { connection.disconnectGeminiKey(); }
    catch (error) { return error.message; }
  })).toContain('Wait for the current AI request');
  await expect.poll(() => Boolean(release)).toBe(true);
  release!();
  await expect(page.getByRole('button', { name: 'Remove key', exact: true })).toBeEnabled();
});

test('API settings stay outside the build area and close without losing the topic', async ({ page }) => {
  await page.goto('/');
  const main = page.getByRole('main');
  const settings = page.getByRole('button', { name: /^API settings/ });
  await expect(main.getByLabel('Google API key', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'API settings', exact: true })).not.toBeVisible();
  await page.getByLabel('Topic', { exact: true }).fill('Keep this unfinished topic');
  await settings.click();
  const dialog = page.getByRole('dialog', { name: 'API settings', exact: true });
  await expect(dialog).toBeVisible();
  await expect(main.getByLabel('Google API key', { exact: true })).toHaveCount(0);
  await dialog.getByLabel('Google API key', { exact: true }).fill('unsaved-test-key');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(settings).toBeFocused();
  await expect(page.getByLabel('Topic', { exact: true })).toHaveValue('Keep this unfinished topic');
  await settings.click();
  await expect(dialog.getByLabel('Google API key', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Close API settings', exact: true }).click();
  await expect(settings).toBeFocused();
  await page.getByRole('button', { name: 'Open API settings', exact: true }).click();
  await expect(dialog).toBeVisible();
});

test('closing settings preserves the connected key and keyboard focus stays inside the dialog', async ({ page }) => {
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    await route.fulfill({ json: { name: 'models/gemini-2.5-flash' } });
  });
  await page.goto('/');
  await connect(page);
  const dialog = page.getByRole('dialog', { name: 'API settings', exact: true });
  for (let step = 0; step < 12; step++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await page.getByRole('button', { name: 'Close API settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Generate Comic Plan' })).toBeEnabled();
  await page.getByRole('button', { name: /^API settings/ }).click();
  await expect(dialog.getByText('Key connected · checked', { exact: true })).toBeVisible();
});
