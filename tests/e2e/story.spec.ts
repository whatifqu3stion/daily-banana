import { expect, test, type Page } from '@playwright/test';

const IMAGE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const BACKGROUND = 'Example Bank received a $1.2 billion fine for compliance failures.';
const form = { topic: 'Bank compliance fine', newsContext: BACKGROUND, stance: 'critical', comedicStyle: 'dark-comedy', illustrationStyle: 'default-color', imageModel: 'gemini-nano-banana-2.1', brainstormMode: false, includeContext: false };
const plan = {
  title: 'The Cost of Doing Business', premise: 'The fictional executive treats compliance penalties as a budget item.',
  summary: 'A fictional banker budgets for another fine.',
  story: { source_anchor: BACKGROUND, source_excerpt: BACKGROUND, source_panel_slug: 'notice', satirical_argument: 'The fictional bank budgets for penalties instead of reform.', setup: 'A compliance fine arrives.', payoff: 'A recurring payment makes penalties routine.', review_notes: [] },
  panels: ['notice', 'crumple', 'throw'].map((slug, index) => ({
    slug, size: 'medium', aspect_ratio: '1:1', comedic_role: index === 0 ? 'establish' : index === 2 ? 'punchline' : 'escalate',
    action: { id: slug, description: ['Read the fine notice.', 'Crumple the notice.', 'Throw the crumpled notice into the basket.'][index], before: index ? 'Notice is held.' : 'Fine arrives.', after: index === 2 ? 'Notice is airborne toward basket.' : 'Notice remains in hand.' },
    visual_prompt: ['A fictional executive reads a compliance fine.', 'The same executive crumples the notice.', 'The executive throws paper into a wastebasket.'][index],
    consistency_tags: ['fictional executive in a navy suit'], scene_state: 'Executive remains at desk.',
    text_elements: index === 1 ? [{ text: 'FWOOSH', role: 'sfx', action_id: 'throw', anchor: { x: 75, y: 35 } }] : [],
  })),
};

test.beforeEach(async ({ page }) => {
  await page.route('https://generativelanguage.googleapis.com/**', route => route.abort());
});

async function backend(page: Page, badEffect = false, count = 3) {
  const calls: { endpoint: string; body: any }[] = [];
  await page.route('**/api/gemini/**', async route => {
    const endpoint = route.request().url().split('/').pop()!;
    const body = route.request().postDataJSON();
    calls.push({ endpoint, body });
    if (endpoint === 'connect') return route.fulfill({ json: { connected: true, expiresAt: Date.now() + 1_800_000 } });
    if (endpoint === 'interactions') return route.fulfill({ json: { output_image: { data: IMAGE, mime_type: 'image/png' } } });
    if (endpoint === 'content') {
      const value = structuredClone(plan);
      if (!badEffect) {
        value.panels[2].text_elements = value.panels[1].text_elements;
        value.panels[1].text_elements = [];
      }
      if (count !== 3) {
        value.panels = Array.from({ length: count }, (_, index) => ({
          ...structuredClone(plan.panels[0]), slug: `beat-${index}`, text_elements: [],
          size: (count === 5 && index === 0) || (count === 6 && index === count - 1) ? 'large' : 'medium',
          comedic_role: index === 0 ? 'establish' : index === count - 1 ? 'punchline' : 'escalate',
          action: { ...plan.panels[0].action, id: `action-${index}` },
        }));
        value.story.source_panel_slug = value.panels[0].slug;
      }
      const contents = JSON.stringify(body.contents);
      if (!contents.includes(BACKGROUND)) value.story.source_excerpt = '';
      return route.fulfill({ json: { text: JSON.stringify(contents.includes('exactly 3 comic') ? [value, value, value] : value) } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/');
  await page.evaluate(async () => {
    const path = '/services/geminiConnection.ts';
    await (await import(path)).connectGeminiKey('offline-story-test-key');
  });
  return calls;
}

test('all register/stance/planning branches preserve the input brief and shared story contract', async ({ page }) => {
  const calls = await backend(page);
  const result = await page.evaluate(async ({ form, background }) => {
    const servicePath = '/services/geminiService.ts', constantsPath = '/constants.ts', contractPath = '/services/storyContract.ts';
    const { geminiService, constructImagePrompt } = await import(servicePath);
    const { COMEDIC_STYLE_OPTIONS, STANCE_OPTIONS, ILLUSTRATION_STYLE_OPTIONS } = await import(constantsPath);
    const { inspectStory, panelStoryContext } = await import(contractPath);
    let count = 0;
    const failures: string[] = [];
    for (const style of COMEDIC_STYLE_OPTIONS) for (const stance of STANCE_OPTIONS) for (const brainstorm of [false, true]) {
      const input = { ...form, comedicStyle: style.value, stance: stance.value, brainstormMode: brainstorm, includeContext: count % 2 === 0 };
      const plans = brainstorm ? await geminiService.generateMultipleComicPlans(input, []) : [await geminiService.generateSingleComicPlan(input, [])];
      for (const plan of plans) {
        if (plan.brief.register !== style.value || plan.brief.stance !== stance.value || plan.brief.includeContext !== input.includeContext || plan.brief.background !== background) failures.push('brief');
        if (inspectStory(plan).some(issue => issue.blocking)) failures.push('preflight');
        if (new Set(plan.panels.map(panel => panel.id)).size !== 3) failures.push('identity');
        const panel = plan.panels[2];
        const prompt = constructImagePrompt(panel.visual_prompt, panel.consistency_tags, input.illustrationStyle, input.comedicStyle, undefined, input.stance, '16:9', ['FWOOSH'], panelStoryContext(plan, panel, 2, 3), plan.panels[1].scene_state, plan.set_description);
        if (!prompt.includes('VISIBLE ACTION CONTRACT (throw)') || !prompt.includes('SOURCE ANCHOR (supplied background') || !prompt.includes('OVERLAY TEXT BLACKLIST')) failures.push('image contract');
      }
      count++;
    }
    // Art styles do not replace narrative controls; custom controls remain open-ended.
    for (const art of [...ILLUSTRATION_STYLE_OPTIONS, { value: 'custom watercolor' }]) {
      const prompt = constructImagePrompt('Throw paper.', [], art.value, 'dry bureaucratic comedy', undefined, 'skeptical of everyone');
      if (!prompt.includes('CUSTOM STYLE') || !prompt.includes('skeptical of everyone')) failures.push('custom');
    }
    return { count, failures };
  }, { form, background: BACKGROUND });
  expect(result).toEqual({ count: 42, failures: [] });
  expect(calls.filter(call => call.endpoint === 'content')).toHaveLength(42);
  expect(calls.filter(call => call.endpoint === 'interactions')).toHaveLength(0);
  for (const call of calls.filter(call => call.endpoint === 'content')) {
    expect(call.body.config.responseSchema).toBeDefined();
    expect(call.body.config.systemInstruction).toContain('Action and sound ownership');
    expect(call.body.config.systemInstruction).toContain('Do not explain the punchline, but DO establish the situation');
    expect(call.body.config.systemInstruction).toContain('Let the story choose 1–6 panels, usually 2–4');
    const schema = call.body.config.responseSchema;
    expect((schema.items || schema).properties.panels).toMatchObject({ minItems: '1', maxItems: '6' });
  }
});

test('story concerns preserve source and effect notes without blocking creative choices', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async ({ raw, form }) => {
    const path = '/services/storyContract.ts';
    const { attachStoryBrief, inspectStory } = await import(path);
    const current = attachStoryBrief(raw, form);
    const original = inspectStory(current);
    const fixed = structuredClone(current); fixed.panels[2].text_elements = fixed.panels[1].text_elements; fixed.panels[1].text_elements = [];
    const badSource = structuredClone(fixed); badSource.story.source_excerpt = 'Invented allegation absent from the background.';
    const custom = attachStoryBrief(fixed, { ...form, customPremise: 'My exact required premise.' });
    const silent = structuredClone(fixed); silent.panels.forEach(panel => panel.text_elements = []);
    const counts = [1, 2, 3, 4, 5, 6].map(count => {
      const item = structuredClone(silent);
      item.panels = Array.from({ length: count }, (_, i) => ({ ...silent.panels[0], slug: `panel-${i}`, action: { ...silent.panels[0].action, id: `action-${i}`, description: 'Impossible paperwork expands through a wall.' } }));
      item.story.source_panel_slug = 'panel-0';
      return inspectStory(item).filter(issue => issue.blocking || issue.code === 'panel-count').length;
    });
    const magazine = structuredClone(silent); magazine.brief.illustrationStyle = 'magazine-gag'; magazine.panels = [magazine.panels[0]];
    const topic = attachStoryBrief(silent, { ...form, newsContext: undefined, includeContext: true });
    const noContract = attachStoryBrief({ title: 'Missing', summary: 'Missing', panels: raw.panels }, form);
    return { original: original.map(issue => issue.code), fixed: inspectStory(fixed).filter(issue => issue.blocking), owner: fixed.panels[2].text_elements[0].action_id,
      badSource: inspectStory(badSource).map(issue => issue.code), custom: inspectStory(custom).map(issue => issue.code),
      counts, magazine: inspectStory(magazine).filter(issue => issue.blocking), topicKind: topic.brief.sourceKind,
      missing: inspectStory(noContract).map(issue => issue.code) };
  }, { raw: plan, form });
  expect(result.original).toContain('effect-owner');
  expect(result.fixed).toEqual([]);
  expect(result.owner).toBe('throw');
  expect(result.badSource).toContain('source-excerpt');
  expect(result.custom).toContain('premise-drift');
  expect(result.counts).toEqual([0, 0, 0, 0, 0, 0]);
  expect(result.magazine).toEqual([]);
  expect(result.topicKind).toBe('topic-only');
  expect(result.missing).toContain('legacy-story');
});

test('layouts preserve every story beat in complete rows for 1–6 panels', async ({ page }) => {
  await page.goto('/');
  const layouts = await page.evaluate(async raw => {
    const path = '/utils/layoutAdapter.ts';
    const { layoutAdapter } = await import(path);
    return [1, 2, 3, 4, 5, 6].flatMap(count => ['none', 'first', 'last'].map(feature => {
      const panels = Array.from({ length: count }, (_, i) => ({ ...raw.panels[0],
        slug: `beat-${i}`, size: (feature === 'first' && i === 0) || (feature === 'last' && i === count - 1) ? 'large' : 'medium',
        comedic_role: i === 0 ? 'establish' : i === count - 1 ? 'punchline' : 'escalate',
      }));
      return { count, feature, slots: layoutAdapter(panels) };
    }));
  }, plan);
  for (const { count, slots } of layouts) {
    expect(slots).toHaveLength(count);
    let row = 0;
    for (const slot of slots) {
      row += slot.gridCols;
      expect(row).toBeLessThanOrEqual(6);
      if (row === 6) row = 0;
    }
    expect(row).toBe(0);
  }
});

for (const [count, width] of [[1, 1280], [5, 1280], [6, 1280], [6, 390]]) {
  test(`story-selected ${count} panels reach the editor without padding or truncation (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const calls = await backend(page, false, count);
    await page.getByLabel('Topic', { exact: true }).fill(form.topic);
    await page.getByText('Optional details', { exact: true }).click();
    await expect(page.getByText('1–6 panels est.', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Generate Comic Plan' }).click();
    await page.getByRole('button', { name: 'Choose This Story' }).click();
    await page.getByRole('button', { name: 'Finish the strip' }).click();
    const comic = page.getByTestId('comic-export');
    await expect(comic.getByText(`${count} ${count === 1 ? 'panel' : 'panels'}`, { exact: true })).toBeVisible();
    for (let i = 1; i <= count; i++) await expect(comic.getByLabel(`Panel ${i}`, { exact: true })).toBeVisible();
    expect(calls.filter(call => call.endpoint === 'interactions')).toHaveLength(count);
    const rows = await comic.locator('[aria-label^="Panel "]').evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, right: rect.right, width: rect.width, height: rect.height };
    }));
    expect(rows).toHaveLength(count);
    expect(rows.every(row => row.width > 100 && row.height > 100 && row.x >= 0 && row.right <= width)).toBe(true);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await comic.screenshot({ path: `/tmp/banana-panels-${count}-${width}.png` });
    await expect(comic.getByText(/Vite Error|Unhandled Runtime Error/)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('sound ownership concerns are optional and preserve the creator’s chosen outline', async ({ page }) => {
  const calls = await backend(page, true);
  await page.getByLabel('Topic', { exact: true }).fill(form.topic);
  await page.getByRole('button', { name: 'Generate Comic Plan' }).click();
  await expect(page.getByRole('heading', { name: 'Choose Your Story' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose This Story' })).toBeEnabled();
  const notice = page.getByRole('complementary', { name: 'Story concerns' });
  await notice.getByText('Review details', { exact: true }).click();
  await expect(notice).toContainText('FWOOSH');
  await page.getByRole('button', { name: 'Choose This Story' }).click();
  await expect(page.getByRole('heading', { name: 'Review the first panel' })).toBeVisible();
  await page.getByRole('button', { name: 'Finish the strip' }).click();
  await expect(page.getByText('Final edition', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Panel 2', { exact: true }).getByText('FWOOSH', { exact: true })).toBeVisible();
  expect(calls.filter(call => call.endpoint === 'interactions')).toHaveLength(3);
});

async function harness(page: Page, { failSecond = false, holdSecond = false, model = 'gemini-nano-banana-2.1', context = false, references = false } = {}) {
  await page.goto('/');
  await page.evaluate(async ({ raw, input, options }) => {
    const hookPath = '/hooks/useComicGeneration.ts', servicePath = '/services/geminiService.ts', contractPath = '/services/storyContract.ts';
    const reactPath = '/node_modules/.vite/deps/react.js', clientPath = '/node_modules/.vite/deps/react-dom_client.js';
    const reactModule = await import(reactPath);
    const React = reactModule.default || reactModule;
    const client = await import(clientPath);
    const createRoot = client.createRoot || client.default.createRoot;
    const { default: useGeneration } = await import(hookPath);
    const { geminiService } = await import(servicePath);
    const { attachStoryBrief } = await import(contractPath);
    const w = window as any;
    w.imageCalls = []; w.archiveCalls = 0;
    geminiService.generateSingleComicPlan = async form => {
      const value = structuredClone(raw); value.panels[2].text_elements = value.panels[1].text_elements; value.panels[1].text_elements = [];
      value.premise = form.customPremise || value.premise;
      return attachStoryBrief(value, form);
    };
    geminiService.generatePanelImageWithReferences = async (...args) => {
      const number = w.imageCalls.push(args);
      if (number === 2 && options.holdSecond) await new Promise(resolve => w.releaseSecond = resolve);
      if (number === 2 && options.failSecond) throw new Error('Offline image rejection');
      return `IMAGE_${number}`;
    };
    geminiService.refinePanelImage = async (...args) => { w.refineArgs = args; return 'REFINED'; };
    geminiService.generateContextExplainer = async () => { w.archiveCalls++; return { text: 'Later archive research.', sources: [] }; };
    const host = document.createElement('div'); host.id = 'hook-harness'; document.body.append(host);
    createRoot(host).render(React.createElement(() => { w.hook = useGeneration(); return null; }));
    w.input = { ...input, imageModel: options.model, includeContext: options.context,
      referenceImages: options.references ? [{ file: new File(['image'], 'ref.png', { type: 'image/png' }), tag: 'Reference character' }] : [] };
  }, { raw: plan, input: form, options: { failSecond, holdSecond, model, context, references } });
  await expect.poll(() => page.evaluate(() => Boolean((window as any).hook))).toBe(true);
  await page.evaluate(async () => { const w = window as any; await w.hook.handleFormSubmit(w.input); });
  await expect.poll(() => page.evaluate(() => (window as any).hook.appStage)).toBe('story-swipe');
  await page.evaluate(async () => { const w = window as any; await w.hook.handleSelectStory(w.hook.comicPlans[0]); });
  await expect.poll(() => page.evaluate(() => (window as any).imageCalls.length)).toBeGreaterThanOrEqual(2);
}

test('superseded proof cannot accept an old background result; finish joins pending current work', async ({ page }) => {
  await harness(page, { holdSecond: true });
  await page.evaluate(() => { const w = window as any; w.hook.onUpdateReviewImage('REPLACEMENT_PROOF', w.hook.reviewData.generationId); });
  await expect.poll(() => page.evaluate(() => (window as any).hook.reviewData.firstPanelImage)).toBe('REPLACEMENT_PROOF');
  await page.evaluate(() => (window as any).releaseSecond());
  await page.evaluate(async () => (window as any).hook.handleContinueGeneration());
  const state = await page.evaluate(() => {
    const w = window as any; return { images: w.hook.comicStripData?.panels.map(panel => panel.image), count: w.imageCalls.length, args: w.imageCalls[2] };
  });
  expect(state.images).toEqual(['REPLACEMENT_PROOF', 'IMAGE_3', 'IMAGE_4']);
  expect(state.count).toBe(4); // One superseded call was already sent, never reused.
  expect(JSON.stringify(state.args[4])).toContain('REPLACEMENT_PROOF');
  expect(state.args[9].action.id).toBe('crumple');
});

for (const model of ['gemini-nano-banana-2.1', 'gemini-2.5-flash-image']) {
  test(`pending reuse, image edit warnings and retained manual text with ${model}`, async ({ page }) => {
    await harness(page, { holdSecond: true, model, context: true, references: true });
    await page.evaluate(() => { const w = window as any; w.finishing = w.hook.handleContinueGeneration(); });
    expect(await page.evaluate(() => (window as any).imageCalls.length)).toBe(2);
    await page.evaluate(async () => { const w = window as any; w.releaseSecond(); await w.finishing; });
    await expect.poll(() => page.evaluate(() => (window as any).hook.appStage)).toBe('strip');
    await page.evaluate(() => { const w = window as any, panel = w.hook.comicStripData.panels[2]; w.hook.handleUpdatePanel(2, { text_elements: panel.text_elements.map(el => ({ ...el, text: 'MY EDIT', position: { x: '8%', y: '12%' } })) }); });
    await page.evaluate(async () => (window as any).hook.handleRegeneratePanelImage(1));
    await page.evaluate(async () => (window as any).hook.handleRefinePanelImage(2, 'change the sleeve color'));
    const result = await page.evaluate(() => {
      const w = window as any, data = w.hook.comicStripData;
      return { count: w.imageCalls.length, archive: w.archiveCalls, brief: data.brief, panels: data.panels,
        models: w.imageCalls.map(args => args[5]), contexts: w.imageCalls.map(args => args[9]),
        refs: w.imageCalls[0][4], refined: w.refineArgs[11] };
    });
    expect(result.count).toBe(4); // Three original images plus one explicit regeneration.
    expect(result.archive).toBe(1);
    expect(result.models.every(value => value === model)).toBe(true);
    expect(result.refs[0].tag).toBe('Reference character');
    expect(result.contexts.every(context => context.story && context.brief && context.action)).toBe(true);
    expect(result.panels[2].text_elements[0]).toMatchObject({ text: 'MY EDIT', action_id: 'throw', position: { x: '8%', y: '12%' } });
    expect(result.panels[1].continuityWarning).toContain('Artwork changed');
    expect(result.panels[2].continuityWarning).toContain('Artwork changed');
    expect(result.refined.action.id).toBe('throw');
  });
}

test('background failure remains a failed panel until explicit retry; source and archive remain distinct', async ({ page }) => {
  await harness(page, { failSecond: true });
  await page.evaluate(async () => (window as any).hook.handleContinueGeneration());
  await expect.poll(() => page.evaluate(() => (window as any).hook.appStage)).toBe('strip');
  const before = await page.evaluate(() => { const w = window as any; return { count: w.imageCalls.length, data: w.hook.comicStripData, archive: w.archiveCalls }; });
  expect(before.count).toBe(3);
  expect(before.data.panels[1].failed).toBe(true);
  expect(before.archive).toBe(0);
  expect(before.data.brief.background).toBe(BACKGROUND);
  expect(before.data.context).toBeUndefined();
  await page.evaluate(async () => (window as any).hook.handleRegeneratePanelImage(1));
  await expect.poll(() => page.evaluate(() => (window as any).hook.comicStripData.panels[1].failed)).toBe(false);
  expect(await page.evaluate(() => (window as any).imageCalls.length)).toBe(4);
});

test('review image changes continue without acknowledgment and group downstream concerns', async ({ page }) => {
  const calls = await backend(page);
  await page.getByLabel('Topic', { exact: true }).fill(form.topic);
  await page.getByRole('button', { name: 'Generate Comic Plan' }).click();
  await page.getByRole('button', { name: 'Choose This Story' }).click();
  await page.getByPlaceholder('Add refinement details...').fill('Change only the sleeve color');
  await page.getByRole('button', { name: 'Refine', exact: true }).click();
  const finish = page.getByRole('button', { name: 'Finish the strip' });
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(finish).toBeEnabled();
  await finish.click();
  await expect(page.getByText('Final edition', { exact: true })).toBeVisible();
  const panel = page.getByLabel('Panel 1', { exact: true });
  await panel.focus();
  await panel.getByRole('button', { name: 'Regenerate', exact: true }).first().click();
  await expect(page.getByRole('button', { name: /Mark panel .* reviewed/ })).toHaveCount(0);
  const notice = page.getByRole('complementary', { name: 'Story concerns' });
  await notice.getByText('Review details', { exact: true }).click();
  await expect(notice).toContainText('An earlier reference image changed');
});
