import { expect, test, type Page } from '@playwright/test';

const KEY = 'test-personal-key-not-a-secret';
const OTHER_KEY = 'test-replacement-key-not-a-secret';
const IMAGE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const imageInteraction = () => ({
  id: 'int_test',
  status: 'completed',
  steps: [{ type: 'model_output', content: [{ type: 'image', data: IMAGE, mime_type: 'image/png' }] }],
});
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
  await page.getByRole('button', { name: 'Generate Comic Plan' }).click();
  await page.getByRole('button', { name: 'Open API settings', exact: true }).click();
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
  await expect(page.getByRole('button', { name: 'Generate Comic Plan' })).toBeEnabled();
  await expect(page.getByRole('banner').getByRole('button', { name: /API settings|^API$/ })).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(async () => {
    const path = '/services/geminiConnection.ts';
    const connection = await import(path);
    try { await connection.generateContent({ model: 'gemini-2.5-flash', contents: 'test' }); }
    catch (error) { return error.message; }
  })).toContain('Connect your Google API key');
  expect(await page.evaluate(async () => {
    const path = '/services/geminiService.ts';
    const { geminiService } = await import(path);
    try { await geminiService.generatePanelImageWithReferences('A banana', []); }
    catch (error) { return error.message; }
  })).toContain('Connect your Google API key');
  expect(requests).toBe(0);
  await connect(page);
  expect(requests).toBe(1); // metadata only, no paid generation
  const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(stored).not.toContain(KEY);
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'API settings', exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'Generate Comic Plan' }).click();
  await expect(page.getByRole('alert')).toContainText('Connect your Google key');
  await expect(page.getByRole('button', { name: 'Open API settings', exact: true })).toBeVisible();
  expect(requests).toBe(1);
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 402, height: 874 }]) {
  test(`missing-key recovery preserves inputs at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    let requests = 0;
    await page.route('https://generativelanguage.googleapis.com/**', async route => {
      requests++;
      expect(route.request().method()).toBe('GET');
      await route.fulfill({ json: { name: 'models/gemini-2.5-flash' } });
    });
    await page.goto('/');
    await expect(page.getByRole('banner').getByRole('button', { name: /API settings|^API$/ })).toHaveCount(0);
    await page.getByLabel('Topic', { exact: true }).fill('Keep my comic idea');
    const generate = page.getByRole('button', { name: 'Generate Comic Plan' });
    await generate.focus();
    await page.keyboard.press('Enter');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Your topic and choices will stay right here');
    await expect(page.getByRole('button', { name: 'Open API settings', exact: true })).toBeVisible();
    const bounds = await alert.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(requests).toBe(0);
    await page.getByRole('button', { name: 'Open API settings', exact: true }).click();
    await page.getByLabel('Google API key', { exact: true }).fill(KEY);
    await page.getByRole('button', { name: 'Connect key', exact: true }).click();
    await expect(page.getByText('Key connected · checked', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close API settings', exact: true }).click();
    await expect(alert).toHaveCount(0);
    await expect(generate).toBeFocused();
    await expect(page.getByLabel('Topic', { exact: true })).toHaveValue('Keep my comic idea');
    expect(requests).toBe(1);
    // Native topic validation is restored after connecting; no generation is
    // started automatically, and empty topics cannot reach Google.
    await page.getByLabel('Topic', { exact: true }).fill('');
    await generate.click();
    expect(await page.getByLabel('Topic', { exact: true }).evaluate((element: HTMLTextAreaElement) => element.validity.valueMissing)).toBe(true);
    expect(requests).toBe(1);
  });
}

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
    if (request.url().endsWith('/interactions')) {
      await route.fulfill({ json: imageInteraction() });
      return;
    }
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
  const images = calls.filter(call => call.url.endsWith('/interactions'));
  expect(images.length).toBeGreaterThanOrEqual(3);
  expect(images.every(call => call.body.model === 'gemini-nano-banana-2.1')).toBe(true);
  expect(images.every(call => call.body.response_format.image_size === '2K')).toBe(true);
  expect(images.every(call => call.body.store === false && call.body.stream === false)).toBe(true);
  expect(images.every(call => call.body.response_format.delivery === 'inline')).toBe(true);
  expect(calls.filter(call => !call.url.endsWith('/interactions')).every(call => call.url.includes('gemini-2.5-flash:generateContent'))).toBe(true);
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
      : route.request().url().endsWith('/interactions') ? imageInteraction()
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
  await page.evaluate(async () => {
    const path = '/services/geminiService.ts';
    const { geminiService } = await import(path);
    await geminiService.generatePanelImageWithReferences('A banana', []);
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
    await route.fulfill({ json: imageInteraction() });
  });
  await page.goto('/');
  await connect(page);
  await page.evaluate(async () => {
    const path = '/services/geminiService.ts';
    const { geminiService } = await import(path);
    await geminiService.generatePanelImageWithReferences('A banana', [], undefined, undefined, [], 'gemini-2.5-flash-image');
  });
  expect(imageUrl).toMatch(/\/v1beta\/interactions$/);
  expect(imageRequest.model).toBe('gemini-2.5-flash-image');
  expect(imageRequest.response_format).not.toHaveProperty('image_size');
  await page.evaluate(async image => {
    const path = '/services/geminiService.ts';
    const { geminiService } = await import(path);
    await geminiService.refinePanelImage(image, 'Add a desk', 'A banana', [], undefined, undefined, [], 'gemini-2.5-flash-image');
  }, IMAGE);
  expect(imageRequest.response_format).not.toHaveProperty('image_size');
  expect(imageRequest.input[0]).toEqual({ type: 'image', data: IMAGE, mime_type: 'image/png' });
});

test('Interactions preserves tagged references and aspect ratios for generation and edits', async ({ page }) => {
  const calls: any[] = [];
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { name: 'models/gemini-2.5-flash' } });
      return;
    }
    calls.push(route.request().postDataJSON());
    await route.fulfill({ json: imageInteraction() });
  });
  await page.goto('/');
  await connect(page);
  await page.evaluate(async image => {
    const path = '/services/geminiService.ts';
    const { geminiService } = await import(path);
    const refs = [{ base64: image, mimeType: 'image/webp', tag: 'Character sheet: newsroom banana' }];
    await geminiService.generatePanelImageWithReferences('A banana', ['banana'], undefined, undefined, refs, 'gemini-nano-banana-2.1', undefined, '16:9');
    await geminiService.refinePanelImage(image, 'Bigger desk', 'A banana', ['banana'], undefined, undefined, refs, 'gemini-nano-banana-2.1', undefined, '16:9');
  }, IMAGE);
  expect(calls).toHaveLength(2);
  for (const call of calls) {
    expect(call.response_format.aspect_ratio).toBe('16:9');
    expect(call.input.slice(-2)).toEqual([
      { type: 'text', text: 'Character sheet: newsroom banana' },
      { type: 'image', data: IMAGE, mime_type: 'image/webp' },
    ]);
    expect(call.store).toBe(false);
    expect(call).not.toHaveProperty('previous_interaction_id');
  }
  expect(calls[1].input[0]).toEqual({ type: 'image', data: IMAGE, mime_type: 'image/png' });
  expect(calls[1].input[1].text).toContain('Bigger desk');
});

test('JPEG image output is converted to PNG before display and subsequent refinement', async ({ page }) => {
  await page.goto('/');
  const jpeg = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 2;
    return canvas.toDataURL('image/jpeg').split(',')[1];
  });
  let editInput: any;
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { name: 'models/gemini-2.5-flash' } });
      return;
    }
    editInput = route.request().postDataJSON().input;
    await route.fulfill({ json: {
      id: 'int_jpeg', status: 'completed',
      steps: [{ type: 'model_output', content: [{ type: 'image', data: jpeg, mime_type: 'image/jpeg' }] }],
    } });
  });
  await connect(page);
  const png = await page.evaluate(async () => {
    const path = '/services/geminiService.ts';
    const { geminiService } = await import(path);
    const image = await geminiService.generatePanelImageWithReferences('A banana', []);
    await geminiService.refinePanelImage(image, 'Bigger desk', 'A banana', []);
    return image;
  });
  expect(png).toMatch(/^iVBORw0KGgo/);
  expect(editInput[0]).toEqual({ type: 'image', data: png, mime_type: 'image/png' });
});

test('image quota errors retain billing guidance and are not retried', async ({ page }) => {
  let imageCalls = 0;
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { name: 'models/gemini-2.5-flash' } });
    } else if (route.request().url().endsWith('/interactions')) {
      imageCalls++;
      await route.fulfill({ json: {
        id: 'int_failed', status: 'failed',
        steps: [{ type: 'model_output', error: { code: 8, message: 'Project quota exceeded' } }],
      } });
    } else {
      await route.fulfill({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(plan) }] } }] } });
    }
  });
  await page.goto('/');
  await connect(page);
  await page.getByRole('button', { name: 'Close API settings', exact: true }).click();
  await page.getByLabel('Topic', { exact: true }).fill('Office automation');
  await page.getByRole('button', { name: 'Generate Comic Plan' }).click();
  await page.getByRole('button', { name: 'Choose This Story' }).click();
  await expect(page.getByRole('heading', { name: 'Google API usage limit reached' })).toBeVisible();
  await expect(page.getByText(/This is not a problem with your topic/)).toBeVisible();
  expect(imageCalls).toBe(1);
});

test('Interactions errors and refusals do not retry or expose the key; empty output retries are bounded', async ({ page }) => {
  let imageCalls = 0;
  let mode = 'transport';
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { name: 'models/gemini-2.5-flash' } });
      return;
    }
    imageCalls++;
    if (mode === 'transport') {
      await route.fulfill({ status: 403, json: { error: { code: 403, status: 'PERMISSION_DENIED', message: `No access for ${KEY}` } } });
    } else if (mode === 'step') {
      await route.fulfill({ json: { id: 'int_failed', status: 'failed', steps: [{ type: 'model_output', error: { code: 7, message: `Blocked for ${KEY}` } }] } });
    } else if (mode === 'failed') {
      await route.fulfill({ json: { id: 'int_failed', status: 'failed', steps: [] } });
    } else {
      await route.fulfill({ json: { id: 'int_text', status: 'completed', steps: [{
        type: 'model_output', content: [{ type: 'text', text: mode === 'refusal' ? 'I cannot generate this image due to content policy.' : 'No image yet.' }],
      }] } });
    }
  });
  await page.goto('/');
  await connect(page);
  const run = () => page.evaluate(async () => {
    const path = '/services/geminiService.ts';
    const { geminiService } = await import(path);
    try { await geminiService.generatePanelImageWithReferences('A banana', []); }
    catch (error) { return error.message; }
  });
  for (const current of ['transport', 'step', 'failed', 'refusal', 'empty']) {
    mode = current;
    imageCalls = 0;
    const error = await run();
    expect(error).toBeTruthy();
    expect(error).not.toContain(KEY);
    expect(imageCalls).toBe(current === 'empty' ? 3 : 1);
    await expect(page.getByRole('button', { name: 'Remove key', exact: true })).toBeEnabled();
  }
});

test('key changes are blocked while an AI request is running', async ({ page }) => {
  let release: (() => void) | undefined;
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { name: 'models/gemini-2.5-flash' } });
      return;
    }
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ json: imageInteraction() });
  });
  await page.goto('/');
  await connect(page);
  await page.evaluate(async () => {
    const path = '/services/geminiService.ts';
    const { geminiService } = await import(path);
    void geminiService.generatePanelImageWithReferences('A banana', []);
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
  const settings = page.getByRole('button', { name: 'Open API settings', exact: true });
  await expect(main.getByLabel('Google API key', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'API settings', exact: true })).not.toBeVisible();
  await page.getByLabel('Topic', { exact: true }).fill('Keep this unfinished topic');
  await page.getByRole('button', { name: 'Generate Comic Plan' }).click();
  await expect(page.getByRole('alert')).toContainText('Your topic and choices will stay right here');
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

for (const width of [1440, 402]) {
  test(`API settings typography follows the app hierarchy at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route('https://generativelanguage.googleapis.com/**', async route => {
      await route.fulfill(route.request().headers()['x-goog-api-key'] === OTHER_KEY
        ? { status: 400, json: { error: { code: 400, message: 'API key not valid', status: 'INVALID_ARGUMENT' } } }
        : { json: { name: 'models/gemini-2.5-flash' } });
    });
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
        title: style('#api-settings-title'),
        section: style('#gemini-connection-heading'),
        label: style('label[for="google-api-key"]'),
        help: style('#key-check-status'),
        input: style('#google-api-key'),
        action: style('button[type="submit"]'),
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
    const connectedHelp = dialog.getByText('This confirms the credential was checked;', { exact: false });
    await expect(connectedHelp).toBeVisible();
    expect(await connectedHelp.evaluate(element => getComputedStyle(element).fontSize)).toBe('16px');
    await dialog.getByRole('button', { name: 'Replace key', exact: true }).click();
    await dialog.getByLabel('Google API key', { exact: true }).fill(OTHER_KEY);
    await dialog.getByRole('button', { name: 'Replace key', exact: true }).click();
    await expect(dialog.getByRole('alert')).toBeVisible();
    expect(await dialog.getByRole('alert').evaluate(element => getComputedStyle(element).fontSize)).toBe('16px');
    expect(await dialog.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(false);
  });
}
