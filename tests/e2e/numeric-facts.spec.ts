import { expect, test, type Page } from '@playwright/test';

const BACKGROUND = 'Example Bank received a $1.21 billion fine for compliance failures.';
const PREMISE = 'Treat penalties as subscriptions.';
const IMAGE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const form = { topic: 'Bank compliance fine', newsContext: BACKGROUND, stance: 'critical', comedicStyle: 'dark-comedy', illustrationStyle: 'default-color', imageModel: 'gemini-nano-banana-2.1', brainstormMode: false, includeContext: false };
const rawPlan = {
  title: 'Routine Expenses', premise: PREMISE, summary: 'A fictional banker treats penalties as overhead.',
  story: { source_anchor: BACKGROUND, source_excerpt: BACKGROUND, source_panel_slug: 'notice', satirical_argument: 'Penalties are treated as overhead.', setup: 'A fine arrives.', payoff: 'A payment is treated as routine.', review_notes: [] },
  panels: ['notice', 'pay'].map((slug, index) => ({
    slug, size: 'medium', aspect_ratio: '1:1', comedic_role: index ? 'punchline' : 'establish',
    visual_prompt: index ? 'A fictional banker pays a fine.' : 'A fictional assistant delivers a fine notice.',
    action: { id: slug, description: index ? 'Pay the fine.' : 'Deliver the notice.', before: 'The notice is held.', after: 'The banker receives the notice.' },
    consistency_tags: ['fictional banker'], scene_state: 'Banker stays at desk.',
    text_elements: index ? [] : [{ role: 'speech', text: 'TWELVE BILLION? AGAIN?', action_id: '' }],
  })),
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.route('https://generativelanguage.googleapis.com/**', route => route.abort());
});

test('money normalization handles words, scales, currencies and explicit rounding without conflating values', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/services/moneyNormalization.ts';
    const { moneyMentions, isPermittedRounding } = await import(path);
    const examples = ['$1.21 billion', '$1,210,000,000', 'one point two one billion dollars', 'twelve billion', 'USD 1.21bn', '€1.21 billion', '£12 million', 'C$4.5m', 'A$9k', '$0', '$0.05', '$1,2 billion'];
    const parsed = examples.map(text => moneyMentions(text).map(({ raw, value, currency }) => ({ raw, value, currency })));
    return { parsed,
      malformed: ['one two billion dollars', 'one hundred hundred billion dollars', 'one and two billion dollars'].map(text => moneyMentions(text)[0]?.value),
      rounding: ['$1.2 billion', '$1 billion', '$12 billion', '$1.21 billion'].map(text => isPermittedRounding('1210000000', moneyMentions(text)[0])),
      counts: moneyMentions('two million voters and three billion users').length };
  });
  expect(result.parsed.slice(0, 3).map(items => items[0].value)).toEqual(['1210000000', '1210000000', '1210000000']);
  expect(result.parsed[3][0].value).toBe('12000000000');
  expect(result.parsed[3][0].currency).toBeUndefined();
  expect(result.parsed[4][0]).toMatchObject({ value: '1210000000', currency: 'USD' });
  expect(result.parsed[5][0]).toMatchObject({ value: '1210000000', currency: 'EUR' });
  expect(result.parsed[6][0]).toMatchObject({ value: '12000000', currency: 'GBP' });
  expect(result.parsed[7][0]).toMatchObject({ value: '4500000', currency: 'CAD' });
  expect(result.parsed[8][0]).toMatchObject({ value: '9000', currency: 'AUD' });
  expect(result.parsed[9][0].value).toBe('0');
  expect(result.parsed[10][0].value).toBe('0.05');
  expect(result.parsed[11][0].value).toBeUndefined();
  expect(result.rounding).toEqual([true, false, false, false]);
  expect(result.counts).toBe(0);
  expect(result.malformed).toEqual([undefined, undefined, undefined]);
});

async function backend(page: Page, { mixed = false, archive = '', valid = false, failArchive = false, dialogue = '' } = {}) {
  const calls: { endpoint: string; body: any }[] = [];
  await page.route('**/api/gemini/**', async route => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)!;
    const body = route.request().postDataJSON();
    calls.push({ endpoint, body });
    if (endpoint === 'connect') return route.fulfill({ json: { connected: true, expiresAt: Date.now() + 1_800_000 } });
    if (endpoint === 'interactions') return route.fulfill({ json: { output_image: { data: IMAGE, mime_type: 'image/png' } } });
    if (endpoint === 'content') {
      if (JSON.stringify(body.contents).includes('Context Explanation')) {
        if (failArchive) return route.fulfill({ status: 502, json: { error: { code: 502, message: 'Offline archive failure' } } });
        return route.fulfill({ json: { text: archive, candidates: [{ groundingMetadata: { groundingChunks: [{ web: { uri: 'https://example.com/later', title: 'Later research' } }] } }] } });
      }
      const bad = structuredClone(rawPlan), good = structuredClone(rawPlan);
      if (dialogue) bad.panels[0].text_elements[0].text = dialogue;
      good.title = 'A Valid Alternative';
      good.panels[0].text_elements[0].text = '$1,210,000,000? Again?';
      const plans = mixed ? [bad, good, good] : [valid ? good : bad];
      return route.fulfill({ json: { text: JSON.stringify(JSON.stringify(body.contents).includes('exactly 3 comic') ? plans : plans[0]) } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/');
  await page.evaluate(async () => {
    const path = '/services/geminiConnection.ts';
    await (await import(path)).connectGeminiKey('offline-numeric-test-key');
  });
  return calls;
}

async function setup(page: Page, brainstorm = false, context = false) {
  await page.getByLabel('Topic', { exact: true }).fill(form.topic);
  await page.getByRole('button', { name: '+ Add background context', exact: true }).click();
  await page.getByLabel('Background Context', { exact: false }).fill(BACKGROUND);
  await page.getByText('Optional details', { exact: true }).click();
  await page.locator('#brainstormMode').setChecked(brainstorm);
  await page.locator('#includeContext').setChecked(context);
  await page.getByRole('button', { name: 'Generate Comic Plan' }).click();
  await expect(page.getByRole('heading', { name: 'Choose Your Story' })).toBeVisible();
}

test('existing planning request includes fact ids and same-response checks for every settings branch', async ({ page }) => {
  const calls = await backend(page, { valid: true });
  const result = await page.evaluate(async input => {
    const servicePath = '/services/geminiService.ts', constantsPath = '/constants.ts', factsPath = '/services/numericFacts.ts';
    const { geminiService } = await import(servicePath);
    const { COMEDIC_STYLE_OPTIONS, STANCE_OPTIONS } = await import(constantsPath);
    const { inspectNumericFacts } = await import(factsPath);
    let count = 0;
    const failures: string[] = [];
    for (const style of [...COMEDIC_STYLE_OPTIONS, { value: 'custom dry humor' }]) for (const stance of [...STANCE_OPTIONS, { value: 'custom skepticism' }]) {
      for (const branch of ['single', 'brainstorm', 'custom']) {
        const form = { ...input, comedicStyle: style.value, stance: stance.value, brainstormMode: branch === 'brainstorm',
          customPremise: branch === 'custom' ? input.customPremise : undefined, includeContext: count % 2 === 0,
          imageModel: count % 2 ? 'gemini-2.5-flash-image' : 'gemini-nano-banana-2.1' };
        const plans = branch === 'brainstorm' ? await geminiService.generateMultipleComicPlans(form, []) : [await geminiService.generateSingleComicPlan(form, [])];
        for (const plan of plans) {
          if (inspectNumericFacts(plan).some(issue => issue.blocking) || plan.numericFacts[0]?.value !== '1210000000') failures.push(branch);
          if (!plan.numericUses.some(use => use.fact_id === plan.numericFacts[0].id)) failures.push('binding');
        }
        count++;
      }
    }
    return { count, failures };
  }, { ...form, customPremise: PREMISE });
  expect(result.count).toBe(96);
  expect(result.failures).toEqual([]);
  for (const call of calls.filter(call => call.endpoint === 'content')) {
    expect(call.body.config.systemInstruction).toContain('Monetary evidence check BEFORE drawing');
    expect(JSON.stringify(call.body.contents)).toContain('1210000000');
    expect(call.body.config.responseSchema).toBeDefined();
  }
  expect(calls.filter(call => call.endpoint === 'interactions')).toHaveLength(0);
});


test('amount checks are advisory, preserve evidence, accept ordinary rounding and ignore fictional claims', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async ({ raw, input }) => {
    const contractPath = '/services/storyContract.ts', factsPath = '/services/numericFacts.ts';
    const { attachStoryBrief, assertDrawableStory, inspectStory } = await import(contractPath);
    const { inspectNumericFacts, checkArchiveAmounts } = await import(factsPath);
    const initial = attachStoryBrief(raw, input);
    assertDrawableStory(initial);
    const variants = ['$1,210,000,000', '$1.2 billion', 'one point two one billion dollars', '$12 billion', '€1.21 billion'].map(text => {
      const plan = structuredClone(initial); plan.panels[0].text_elements[0].text = text;
      return inspectNumericFacts(plan);
    });
    const fiction = structuredClone(initial);
    fiction.numericUses = [{ location: 'panel:notice:text:0', quote: 'TWELVE BILLION', intent: 'fiction', fact_id: '', approximation: 'exact' }];
    const multiple = attachStoryBrief(raw, { ...input, topic: 'Other Bank paid $12 billion.' });
    const malformed = { ...initial, panels: [] };
    let technicalError = false; try { assertDrawableStory(malformed); } catch { technicalError = true; }
    return { variants, original: inspectNumericFacts(initial), fiction: inspectNumericFacts(fiction),
      evidence: initial.numericFacts, multipleEvidence: multiple.numericFacts,
      multipleBlocking: inspectStory(multiple).filter(issue => issue.blocking), technicalError,
      exactArchive: checkArchiveAmounts('The fine was $1.21 billion.', initial),
      conflictingArchive: checkArchiveAmounts('The fine was $12 billion.', initial) };
  }, { raw: rawPlan, input: form });
  expect(result.variants.slice(0, 3)).toEqual([[], [], []]);
  expect(result.variants[3]).toEqual([expect.objectContaining({ code: 'amount-mismatch', blocking: false })]);
  expect(result.variants[4]).toEqual([expect.objectContaining({ blocking: false })]);
  expect(result.original.every(issue => !issue.blocking)).toBe(true);
  expect(result.fiction).toEqual([]);
  expect(result.multipleBlocking).toEqual([]);
  expect(result.multipleEvidence).toHaveLength(2);
  expect(result.evidence[0]).toMatchObject({ display: '$1.21 billion', value: '1210000000', provenance: 'supplied-background' });
  expect(result.technicalError).toBe(true);
  expect(result.exactArchive).toBeUndefined();
  expect(result.conflictingArchive).toContain('left out');
});

for (const width of [1440, 402]) test(`amount concerns allow the full flow with no acknowledgments at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const calls = await backend(page);
  await setup(page);
  const notice = page.getByRole('complementary', { name: 'Story concerns', exact: true });
  await expect(notice).toContainText('Some amounts may need a look.');
  await expect(notice.locator('details')).not.toHaveAttribute('open');
  await expect(page.getByRole('button', { name: 'Choose This Story' })).toBeEnabled();
  await expect(page.getByRole('button', { name: /Bind source|Approve approximate|Confirm this claim/ })).toHaveCount(0);
  await notice.getByText('Review details', { exact: true }).click();
  await expect(notice).toContainText('TWELVE BILLION');
  await expect(notice).toContainText('$1.21 billion');
  await expect(notice).not.toContainText('panel:notice:text:0');
  await notice.getByText('Review details', { exact: true }).click();
  await page.getByRole('button', { name: 'Choose This Story' }).click();
  await expect(page.getByRole('heading', { name: 'Review the first panel' })).toBeVisible();
  await page.getByRole('button', { name: 'Regenerate', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Finish the strip' })).toBeEnabled();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Finish the strip' }).click();
  await expect(page.getByText('Final edition', { exact: true })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Story concerns', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Mark panel .* reviewed/ })).toHaveCount(0);
  await expect(page.getByLabel('Panel 1', { exact: true }).getByText('TWELVE BILLION? AGAIN?', { exact: true })).toBeVisible();
  const finalNotice = page.getByRole('complementary', { name: 'Story concerns', exact: true });
  expect(await finalNotice.evaluate(element => element.closest('[data-testid="comic-export"]') === null)).toBe(true);
  await page.screenshot({ path: `/tmp/banana-advisory-${width}.png`, fullPage: true });
  const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(element => {
    const box = element.getBoundingClientRect(); return box.width > 0 && box.right > innerWidth + 1 && getComputedStyle(element).visibility !== 'hidden';
  }).map(element => ({ tag: element.tagName, cls: element.className, right: element.getBoundingClientRect().right })).slice(0, 12));
  expect(overflow).toEqual([]);
  await page.mouse.move(0, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const before = calls.filter(call => call.endpoint === 'interactions').length;
  await finalNotice.getByText('Review details', { exact: true }).click();
  expect(calls.filter(call => call.endpoint === 'interactions')).toHaveLength(before);
  await page.screenshot({ path: `/tmp/banana-advisory-${width}.png`, fullPage: true });
});

test('ordinary rounding and clean stories add no review UI', async ({ page }) => {
  await backend(page, { dialogue: '$1.2 billion? Again?' });
  await setup(page);
  await expect(page.getByRole('complementary', { name: 'Story concerns', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Choose This Story' })).toBeEnabled();
});

test('repeated amount concerns are grouped across planning fields', async ({ page }) => {
  await backend(page);
  await setup(page);
  await page.evaluate(async ({ raw, input }) => {
    const contractPath = '/services/storyContract.ts';
    const { attachStoryBrief } = await import(contractPath);
    raw.panels[0].visual_prompt += ' A notice says TWELVE BILLION.';
    raw.panels[0].scene_state += ' TWELVE BILLION appears on the notice.';
    const plan = attachStoryBrief(raw, input);
    const reactPath = '/node_modules/.vite/deps/react.js', clientPath = '/node_modules/.vite/deps/react-dom_client.js', checkPath = '/components/StoryCheck.tsx';
    const react = await import(reactPath), client = await import(clientPath), component = await import(checkPath);
    const host = document.createElement('div'); host.id = 'grouping-check'; document.body.append(host);
    const React = react.default || react;
    (client.createRoot || client.default.createRoot)(host).render(React.createElement(component.default, { plan }));
  }, { raw: rawPlan, input: form });
  const grouped = page.locator('#grouping-check');
  await grouped.getByText('Review details', { exact: true }).click();
  await expect(grouped.locator('li')).toHaveCount(1);
  await expect(grouped).toContainText('Panel 1');
});

test('archive cleanup removes citation debris without changing prose or source amounts', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/utils/archiveText.ts';
    const { cleanArchiveText } = await import(path);
    return [
      'Revenue reached $426 billion [cite: amount-z7lu7, amount-19q7g09, 1, 8], or 82.7% [cite: 4, 11, 12, 13].',
      'Growth [1, 2] slowed [citation: 3] amid uncertainty citeturn0search0.',
      'Supplied estimates [2026] put revenue at $1.21 billion (70%–80%). [Preliminary estimate] remains a qualification.',
      '[cite: amount-123, 1]',
    ].map(cleanArchiveText);
  });
  expect(result).toEqual([
    'Revenue reached $426 billion, or 82.7%.',
    'Growth slowed amid uncertainty.',
    'Supplied estimates [2026] put revenue at $1.21 billion (70%–80%). [Preliminary estimate] remains a qualification.',
    '',
  ]);
});

for (const width of [1280, 390]) test(`archive prose and export stay clean with source links preserved (${width})`, async ({ page }) => {
  await page.setViewportSize({ width, height: 960 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const calls = await backend(page, { valid: true, archive: 'Supplied background reports a $1.21 billion fine [cite: amount-z7lu7, 1, 8]. Later reporting discusses the context [2].' });
  await setup(page, false, true);
  await page.getByRole('button', { name: 'Choose This Story' }).click();
  await page.getByRole('button', { name: 'Finish the strip' }).click();
  const comic = page.getByTestId('comic-export');
  await expect(comic.getByRole('heading', { name: 'A Note from the Archives' })).toBeVisible();
  await expect(comic).toContainText('Supplied background reports a $1.21 billion fine. Later reporting discusses the context.');
  await expect(comic).not.toContainText(/\[cite:|amount-z7lu7|\[2\]/);
  await expect(comic.getByRole('link', { name: 'example.com' })).toHaveAttribute('href', 'https://example.com/later');
  const archives = calls.filter(call => call.endpoint === 'content' && JSON.stringify(call.body.contents).includes('Context Explanation'));
  expect(archives).toHaveLength(1);
  expect(archives[0].body.contents).not.toMatch(/amount-|fact_id|MONETARY BINDINGS/);
  expect(archives[0].body.contents).toContain('Return only plain prose');
  expect(archives[0].body.contents).toContain(BACKGROUND);
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
  await comic.screenshot({ path: `/tmp/banana-archive-clean-${width}.png` });
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const download = await downloading;
  expect(await download.failure()).toBeNull();
  await download.saveAs(`/tmp/banana-archive-export-${width}.png`);
  expect(errors).toEqual([]);
});

for (const failArchive of [false, true]) test(`optional archive concerns stay outside the artwork and never stop finishing (${failArchive})`, async ({ page }) => {
  await backend(page, { archive: 'Later research reports a $12 billion fine.', failArchive });
  await setup(page, false, true);
  await page.getByRole('button', { name: 'Choose This Story' }).click();
  await page.getByRole('button', { name: 'Finish the strip' }).click();
  await expect(page.getByText('Final edition', { exact: true })).toBeVisible();
  const notice = page.getByRole('complementary', { name: 'Story concerns', exact: true });
  await notice.getByText('Review details', { exact: true }).click();
  await expect(notice).toContainText(failArchive ? 'could not be completed' : 'left out');
  if (!failArchive) await expect(notice.getByRole('link', { name: 'Later research' })).toHaveAttribute('href', 'https://example.com/later');
  await expect(page.getByTestId('comic-export').getByText('Later research reports a $12 billion fine.', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeEnabled();
});

test('edited amount conflicts preserve geometry, allow redraw and refinement, and export without review notes', async ({ page }) => {
  const calls = await backend(page, { valid: true });
  await setup(page);
  await page.getByRole('button', { name: 'Choose This Story' }).click();
  await page.getByRole('button', { name: 'Finish the strip' }).click();
  await expect(page.getByText('Final edition', { exact: true })).toBeVisible();
  const panel = page.getByLabel('Panel 1', { exact: true });
  const editor = panel.locator('[contenteditable=true]').first();
  await editor.fill('$12 billion? Again?'); await editor.blur();
  const before = await editor.evaluate(element => ({ left: element.parentElement!.style.left, top: element.parentElement!.style.top }));
  const notice = page.getByRole('complementary', { name: 'Story concerns', exact: true });
  await expect(notice).toBeVisible();
  await panel.focus(); await panel.getByRole('button', { name: 'Regenerate', exact: true }).first().click();
  await expect.poll(() => calls.filter(call => call.endpoint === 'interactions').length).toBe(3);
  await panel.locator('input').first().fill('Change only the sleeve color');
  await panel.getByRole('button', { name: 'Refine', exact: true }).first().click();
  await expect.poll(() => calls.filter(call => call.endpoint === 'interactions').length).toBe(4);
  await expect(editor).toHaveText('$12 billion? Again?');
  expect(await editor.evaluate(element => ({ left: element.parentElement!.style.left, top: element.parentElement!.style.top }))).toEqual(before);
  await expect(page.getByTestId('comic-export').getByRole('complementary', { name: 'Story concerns' })).toHaveCount(0);
  await expect(page.getByTestId('comic-export')).not.toContainText('approved by creator');
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const download = await downloading;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.png$/);
});
