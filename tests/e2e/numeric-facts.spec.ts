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

test('preflight checks every planned channel, retains distinct claims, and requires explicit source/rounding decisions', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async ({ raw, input }) => {
    const contractPath = '/services/storyContract.ts', factsPath = '/services/numericFacts.ts';
    const { attachStoryBrief, inspectStory } = await import(contractPath);
    const { bindNumericUse, approveNumericUse, checkArchiveAmounts, inspectNumericFacts, replaceNumericText, sanitizeNumericUses } = await import(factsPath);
    const plan = attachStoryBrief(raw, input);
    const location = 'panel:notice:text:0';
    const fixed = replaceNumericText(plan, location, 'TWELVE BILLION', 'one point two one billion');
    const normalized = inspectNumericFacts(fixed);
    const rounded = replaceNumericText(plan, location, 'TWELVE BILLION', '$1.2 billion');
    const roundingIssue = inspectNumericFacts(rounded).find(issue => issue.canRound);
    if (!roundingIssue) throw new Error(`No rounding issue: ${JSON.stringify(inspectNumericFacts(rounded))}`);
    const approved = approveNumericUse(rounded, roundingIssue, 'rounding');
    const changed = replaceNumericText(approved, location, '$1.2 billion', '$12 billion');
    const channels = ['title', 'summary', 'premise', 'set_description', 'visual', 'caption', 'action', 'scene', 'tags'].map(channel => {
      const item = structuredClone(fixed);
      if (['title', 'summary', 'premise', 'set_description'].includes(channel)) item[channel] = 'Twelve billion dollars';
      if (channel === 'visual') item.panels[0].visual_prompt += ' A notice reads $12 billion.';
      if (channel === 'caption') item.panels[1].text_elements = [{ text: 'Twelve billion.', role: 'caption' }];
      if (channel === 'action') item.panels[1].action.description += ' Pay $12 billion.';
      if (channel === 'scene') item.panels[1].scene_state += ' Check for $12 billion.';
      if (channel === 'tags') item.panels[1].consistency_tags.push('check labelled $12 billion');
      return inspectNumericFacts(item).some(issue => issue.blocking);
    });
    const multi = attachStoryBrief(raw, { ...input, newsContext: `${input.newsContext} Other Bank received a $12 billion fine. Example Bank also paid a €2 million fee.` });
    let boundMulti = multi;
    // With multiple claims, equal values alone must not silently choose a subject.
    for (const issue of inspectNumericFacts(multi)) {
      const id = issue.location === location ? multi.numericFacts[1].id : multi.numericFacts[0].id;
      boundMulti = bindNumericUse(boundMulti, issue.location, issue.quote, id);
    }
    const validMulti = inspectNumericFacts(boundMulti).filter(issue => issue.blocking);
    const same = attachStoryBrief(raw, { ...input, newsContext: 'Alpha Bank paid $12 billion. Beta Bank paid $12 billion.' });
    same.panels[0].text_elements[0].text = '$12 billion';
    const ambiguous = inspectNumericFacts(same);
    const bound = bindNumericUse(same, location, '$12 billion', same.numericFacts[1].id);
    const currency = replaceNumericText(plan, location, 'TWELVE BILLION', '€1.21 billion');
    currency.numericUses = [{ location, quote: '€1.21 billion', fact_id: currency.numericFacts[0].id, intent: 'source', approximation: 'exact' }];
    const missing = attachStoryBrief(raw, { ...input, newsContext: 'A compliance failure occurred. No amount was supplied.' });
    const topic = attachStoryBrief(raw, { ...input, newsContext: undefined });
    topic.story.source_anchor = 'Fictional banking.';
    const fiction = structuredClone(plan);
    fiction.numericUses = [{ location, quote: 'TWELVE BILLION', fact_id: '', intent: 'fiction', approximation: 'exact' }];
    const fictionIssue = inspectNumericFacts(fiction).find(issue => issue.canFiction);
    if (!fictionIssue) throw new Error(`No fiction issue: ${JSON.stringify(inspectNumericFacts(fiction))}`);
    const fictionApproved = approveNumericUse(fiction, fictionIssue, 'fiction');
    const repeated = structuredClone(bound);
    repeated.panels[0].text_elements[0].text = '$12 billion for Alpha; $12 billion for Beta.';
    const bareRounded = replaceNumericText(plan, location, 'TWELVE BILLION', 'one point two billion');
    const bareApproval = approveNumericUse(bareRounded, inspectNumericFacts(bareRounded).find(issue => issue.canRound), 'rounding');
    return {
      mismatch: inspectNumericFacts(plan), normalized, channels,
      rounded: inspectNumericFacts(rounded).map(issue => issue.code), approved: inspectNumericFacts(approved),
      changed: inspectNumericFacts(changed).map(issue => issue.code),
      multi: validMulti, facts: multi.numericFacts.map(fact => ({ value: fact.value, currency: fact.currency, subject: fact.subject })),
      ambiguous: ambiguous.map(issue => issue.code), bound: inspectNumericFacts(bound).filter(issue => issue.location === location),
      currency: inspectNumericFacts(currency).map(issue => issue.code),
      missing: inspectNumericFacts(missing).map(issue => issue.code),
      topic: inspectStory(topic).filter(issue => issue.code.startsWith('amount-')),
      fiction: inspectNumericFacts(fiction).map(issue => issue.code), fictionApproved: inspectNumericFacts(fictionApproved),
      repeated: inspectNumericFacts(repeated).map(issue => issue.code),
      archiveExact: checkArchiveAmounts('The fine was $1,210,000,000.', fixed),
      archiveRounded: checkArchiveAmounts('The fine was $1.2 billion.', bareApproval),
      archiveConflict: checkArchiveAmounts('The fine was $12 billion.', fixed),
      archiveWrongClaim: checkArchiveAmounts('The executive received a $1.21 billion bonus.', fixed),
      archiveMultiple: checkArchiveAmounts('The fine was $12 billion.', boundMulti),
      sanitized: sanitizeNumericUses([{ location, quote: '$12 billion', intent: 'source', approved: true }]),
    };
  }, { raw: rawPlan, input: form });
  expect(result.mismatch).toEqual([expect.objectContaining({ code: 'amount-mismatch', quote: 'TWELVE BILLION', blocking: true })]);
  expect(result.normalized).toEqual([]);
  expect(result.channels).toEqual(Array(9).fill(true));
  expect(result.rounded).toContain('amount-rounding');
  expect(result.approved).toEqual([]);
  expect(result.changed).toContain('amount-mismatch');
  expect(result.multi).toEqual([]);
  expect(result.facts.map(fact => fact.currency)).toEqual(['USD', 'USD', 'EUR']);
  expect(result.ambiguous).toContain('amount-ambiguous');
  expect(result.bound).toEqual([]);
  expect(result.currency).toContain('amount-currency');
  expect(result.missing).toContain('amount-ambiguous');
  expect(result.topic.every(issue => !issue.blocking)).toBe(true);
  expect(result.fiction).toContain('amount-fiction');
  expect(result.fictionApproved).toEqual([]);
  expect(result.repeated).toContain('amount-repeated-ambiguous');
  expect(result.archiveExact).toContain('same subject or claim');
  expect(result.archiveRounded).toContain('same subject or claim');
  expect(result.archiveConflict).toContain('distinct provenance');
  expect(result.archiveWrongClaim).toContain('same subject or claim');
  expect(result.archiveMultiple).toContain('multiple monetary subjects');
  expect(result.sanitized[0]).not.toHaveProperty('approved');
});

test('topic and background amounts retain separate bindable provenance when both inputs are supplied', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async ({ raw, input }) => {
    const contractPath = '/services/storyContract.ts', factsPath = '/services/numericFacts.ts';
    const { attachStoryBrief } = await import(contractPath);
    const { bindNumericUse, inspectNumericFacts } = await import(factsPath);
    raw.panels[0].text_elements[0].text = '$2 million? Again?';
    let plan = attachStoryBrief(raw, { ...input, topic: 'Other Bank paid a $2 million settlement.' });
    const facts = plan.numericFacts;
    const topic = facts.find(fact => fact.provenance === 'supplied-topic');
    const background = facts.find(fact => fact.provenance === 'supplied-background');
    const initialIssues = inspectNumericFacts(plan);
    plan = bindNumericUse(plan, 'panel:notice:text:0', '$2 million', topic.id);
    plan = bindNumericUse(plan, 'story:source_anchor', '$1.21 billion', background.id);
    return { facts, initialIssues, after: inspectNumericFacts(plan), uses: plan.numericUses };
  }, { raw: rawPlan, input: form });
  expect(result.facts).toEqual([
    expect.objectContaining({ provenance: 'supplied-topic', value: '2000000', evidence: 'Other Bank paid a $2 million settlement.' }),
    expect.objectContaining({ provenance: 'supplied-background', value: '1210000000', evidence: BACKGROUND }),
  ]);
  expect(result.facts[0].id).not.toBe(result.facts[1].id);
  expect(result.initialIssues.some(issue => issue.quote === '$2 million')).toBe(true);
  expect(result.initialIssues.some(issue => issue.code === 'amount-mismatch')).toBe(false);
  expect(result.after).toEqual([]);
  expect(result.uses.find(use => use.quote === '$2 million')?.fact_id).toBe(result.facts[0].id);
});

async function backend(page: Page, { mixed = false, archive = '', valid = false, failArchive = false } = {}) {
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

for (const width of [1440, 402]) {
  test(`bad source amount blocks first artwork until deliberately corrected at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const calls = await backend(page);
    await setup(page);
    await expect(page.getByRole('button', { name: 'Choose This Story' })).toBeDisabled();
    const review = page.getByRole('region', { name: 'Numeric source review', exact: true });
    await expect(review.getByRole('alert')).toContainText('TWELVE BILLION');
    await expect(review.getByRole('alert')).toContainText('$1.21 billion');
    expect(calls.filter(call => call.endpoint === 'interactions')).toHaveLength(0);
    expect(calls.filter(call => call.endpoint === 'content')).toHaveLength(1);
    await review.getByLabel('Replacement for TWELVE BILLION', { exact: true }).fill('$1.21 billion');
    await review.getByRole('button', { name: 'Apply text correction', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Choose This Story' })).toBeEnabled();
    await page.getByRole('button', { name: 'Choose This Story' }).click();
    await expect(page.getByRole('heading', { name: 'Review the first panel' })).toBeVisible();
    await page.getByRole('button', { name: 'Finish the strip' }).click();
    await expect(page.getByText('Final edition', { exact: true })).toBeVisible();
    expect(calls.filter(call => call.endpoint === 'interactions')).toHaveLength(2);
    expect(calls.filter(call => call.endpoint === 'content')).toHaveLength(1); // Archive disabled.
    for (const call of calls.filter(call => call.endpoint === 'interactions')) {
      const prompt = JSON.stringify(call.body);
      expect(prompt).toContain('MONETARY SOURCE CONTRACT');
      expect(prompt).toContain('1210000000');
      expect(prompt).not.toContain('TWELVE BILLION');
    }
    const panel = page.getByLabel('Panel 1', { exact: true });
    await expect(panel.getByText('$1.21 billion? AGAIN?', { exact: true })).toBeVisible();
    await page.getByText('Supplied monetary evidence (1)', { exact: true }).last().click();
    await expect(page.getByText('Subject').last()).toBeVisible();
    const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')]
      .filter(element => getComputedStyle(element).visibility !== 'hidden' && element.getBoundingClientRect().right > window.innerWidth + 1)
      .map(element => `${element.tagName}.${element.className}`).slice(0, 10));
    expect(overflow).toEqual([]);
    await page.screenshot({ path: `/tmp/numeric-consistency-${width}.png`, fullPage: true });
  });
}

test('brainstorm keeps valid alternatives usable and custom premise cannot bypass preflight', async ({ page }) => {
  const calls = await backend(page, { mixed: true });
  await setup(page, true);
  await expect(page.getByRole('button', { name: 'Choose This Story' })).toBeDisabled();
  await page.getByRole('tab', { name: 'Story 2', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Choose This Story' })).toBeEnabled();
  expect(calls.filter(call => call.endpoint === 'interactions')).toHaveLength(0);
  await page.getByRole('tab', { name: 'Write my own', exact: true }).click();
  await page.getByLabel('Your story premise', { exact: true }).fill(PREMISE);
  await page.getByRole('button', { name: 'Generate from My Idea', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Numeric source review', exact: true }).getByRole('alert')).toContainText('TWELVE BILLION');
  await expect(page.getByRole('button', { name: 'Choose This Story' })).toBeDisabled();
  expect(calls.filter(call => call.endpoint === 'interactions')).toHaveLength(0);
  expect(calls.filter(call => call.endpoint === 'content')).toHaveLength(2);
});

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

for (const failArchive of [false, true]) {
  test(`conflicting or failed later research preserves the comic and withholds the note (failure=${failArchive})`, async ({ page }) => {
    const calls = await backend(page, { valid: true, archive: 'Later research reports a $12 billion fine.', failArchive });
    await setup(page, false, true);
    await page.getByRole('button', { name: 'Choose This Story' }).click();
    await page.getByRole('button', { name: 'Finish the strip' }).click();
    await expect(page.getByText('Final edition', { exact: true })).toBeVisible();
    await expect(page.getByRole('alert', { name: 'Numeric consistency and archive notice' })).toBeVisible();
    if (!failArchive) {
      await expect(page.getByRole('alert', { name: 'Numeric consistency and archive notice' })).toContainText('later research uses');
      await expect(page.getByRole('link', { name: 'example.com', exact: true })).toBeVisible();
    }
    await expect(page.locator('aside').getByText('Later research reports a $12 billion fine.', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Panel 1', { exact: true }).getByText('$1,210,000,000? Again?', { exact: true })).toBeVisible();
    expect(calls.filter(call => call.endpoint === 'interactions')).toHaveLength(2);
    expect(calls.filter(call => call.endpoint === 'content')).toHaveLength(2);
    const archiveRequest = calls.filter(call => call.endpoint === 'content').at(-1)!;
    expect(JSON.stringify(archiveRequest.body.contents)).toContain('ACTUAL PLANNED PANEL TEXT');
    expect(JSON.stringify(archiveRequest.body.contents)).toContain('1210000000');
  });
}

test('a researched bonus with the same amount as a supplied fine is withheld, not attached as factual context', async ({ page }) => {
  const unrelated = 'The executive received a $1.21 billion bonus.';
  const calls = await backend(page, { valid: true, archive: unrelated });
  await setup(page, false, true);
  await page.getByRole('button', { name: 'Choose This Story' }).click();
  await page.getByRole('button', { name: 'Finish the strip' }).click();
  await expect(page.getByText('Final edition', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert', { name: 'Numeric consistency and archive notice' })).toContainText('matching monetary values do not establish the same subject or claim');
  await expect(page.getByText(unrelated, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'example.com', exact: true })).toBeVisible();
  await expect(page.getByLabel('Panel 1', { exact: true }).getByText('$1,210,000,000? Again?', { exact: true })).toBeVisible();
  expect(calls.filter(call => call.endpoint === 'interactions')).toHaveLength(2);
  expect(calls.filter(call => call.endpoint === 'content')).toHaveLength(2);
});

test('hook refuses invalid plans before images, carries evidence to final data and preserves manual edits and geometry', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async ({ raw, input, image }) => {
    const reactPath = '/node_modules/.vite/deps/react.js', clientPath = '/node_modules/.vite/deps/react-dom_client.js';
    const hookPath = '/hooks/useComicGeneration.ts', servicePath = '/services/geminiService.ts', contractPath = '/services/storyContract.ts';
    const reactModule = await import(reactPath), client = await import(clientPath);
    const React = reactModule.default || reactModule;
    const createRoot = client.createRoot || client.default.createRoot;
    const { default: useGeneration } = await import(hookPath);
    const { geminiService } = await import(servicePath);
    const { attachStoryBrief } = await import(contractPath);
    const w = window as any;
    w.images = [];
    geminiService.generateSingleComicPlan = async data => attachStoryBrief(raw, data);
    geminiService.generatePanelImageWithReferences = async (...args) => { w.images.push(args); return image; };
    const host = document.createElement('div'); document.body.append(host);
    createRoot(host).render(React.createElement(() => { w.numericHook = useGeneration(); return null; }));
    w.numericInput = input;
  }, { raw: rawPlan, input: form, image: IMAGE });
  await expect.poll(() => page.evaluate(() => Boolean((window as any).numericHook))).toBe(true);
  await page.evaluate(async () => { const w = window as any; await w.numericHook.handleFormSubmit(w.numericInput); });
  await page.evaluate(async () => { const w = window as any; await w.numericHook.handleSelectStory(w.numericHook.comicPlans[0]); });
  expect(await page.evaluate(() => (window as any).images.length)).toBe(0);
  expect(await page.evaluate(() => (window as any).numericHook.appStage)).toBe('story-swipe');
  await page.evaluate(async () => {
    const w = window as any;
    const path = '/services/numericFacts.ts';
    const { replaceNumericText } = await import(path);
    const fixed = replaceNumericText(w.numericHook.comicPlans[0], 'panel:notice:text:0', 'TWELVE BILLION', '$1.21 billion');
    w.approvedFacts = JSON.stringify(fixed.numericFacts);
    await w.numericHook.handleSelectStory(fixed);
  });
  await expect.poll(() => page.evaluate(() => (window as any).numericHook.appStage)).toBe('review');
  await page.evaluate(async () => { await (window as any).numericHook.handleContinueGeneration(); });
  await expect.poll(() => page.evaluate(() => (window as any).numericHook.appStage)).toBe('strip');
  await page.evaluate(() => {
    const w = window as any, panel = w.numericHook.comicStripData.panels[0];
    w.originalImage = panel.image;
    w.numericHook.handleUpdatePanel(0, { text_elements: panel.text_elements.map(element => ({
      ...element, text: '$12 billion? Again?', position: { x: '33%', y: '19%' }, size: { width: '40%', height: '28%' },
    })) });
  });
  const edited = await page.evaluate(async () => {
    const w = window as any, data = w.numericHook.comicStripData;
    const path = '/services/numericFacts.ts';
    const { inspectNumericFacts, stripAsNumericPlan } = await import(path);
    return { issues: inspectNumericFacts(stripAsNumericPlan(data)), data, factsUnchanged: w.approvedFacts === JSON.stringify(data.numericFacts),
      imageUnchanged: w.originalImage === data.panels[0].image, imageCalls: w.images.length };
  });
  expect(edited.factsUnchanged).toBe(true);
  expect(edited.imageUnchanged).toBe(true);
  expect(edited.imageCalls).toBe(2);
  expect(edited.data.numericUses?.length).toBeGreaterThan(0);
  expect(edited.issues).toEqual([expect.objectContaining({ blocking: true, code: 'amount-mismatch' })]);
  expect(edited.data.panels[0].text_elements[0]).toMatchObject({ text: '$12 billion? Again?', position: { x: '33%', y: '19%' }, size: { width: '40%', height: '28%' } });
  await page.evaluate(async () => { await (window as any).numericHook.handleRegeneratePanelImage(0); });
  expect(await page.evaluate(() => (window as any).images.length)).toBe(2);
});

test('numeric manual-edit warnings stay in the printed capture and optional archive checks never hide finished artwork', async ({ page }) => {
  const archiveText = 'The supplied report describes a penalty for compliance failures.';
  const calls = await backend(page, { valid: true, archive: archiveText });
  await setup(page, false, true);
  await page.getByRole('button', { name: 'Choose This Story' }).click();
  await page.getByRole('button', { name: 'Finish the strip' }).click();
  await expect(page.getByText('Final edition', { exact: true })).toBeVisible();
  await expect(page.getByText(archiveText, { exact: true })).toBeVisible();
  const editor = page.getByLabel('Panel 1', { exact: true }).locator('[contenteditable=true]').first();
  await editor.fill('$12 billion? Again?');
  await editor.blur();
  const notice = page.getByRole('alert', { name: 'Numeric consistency and archive notice' });
  await expect(notice).toContainText('planned “$12 billion” conflicts');
  await expect(notice).toContainText('Archive note hidden');
  await expect(editor).toHaveText('$12 billion? Again?');
  await expect(page.getByText(archiveText, { exact: true })).toHaveCount(0);
  expect(await notice.evaluate(element => !element.closest('.no-export') && Boolean(element.closest('.bg-paper-light.border-3')))).toBe(true);
  expect(calls.filter(call => call.endpoint === 'interactions')).toHaveLength(2);
  expect(calls.filter(call => call.endpoint === 'content')).toHaveLength(2);
  await page.screenshot({ path: '/tmp/numeric-manual-edit-export-warning.png', fullPage: true });
});
