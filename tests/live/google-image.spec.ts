import { expect, test } from '@playwright/test';
import { COST_NOTICE, skipReason, startLiveSession } from './google-live-session.mjs';

test('LIVE Nano Banana 2.1 generates a PNG panel and refines that same PNG', async ({ browser }, testInfo) => {
  console.log(COST_NOTICE);
  const reason = skipReason(process.env);
  if (reason) console.log(reason);
  test.skip(Boolean(reason), reason);
  // Fail closed if CLI/config overrides would record data or multiply charges.
  expect(testInfo.project.use.trace).toBe('off');
  expect(testInfo.project.use.screenshot).toBe('off');
  expect(testInfo.project.use.video).toBe('off');
  expect(testInfo.project.retries).toBe(0);
  expect(testInfo.project.repeatEach).toBe(1);
  expect(Boolean(process.env.DEBUG || process.env.PWDEBUG || process.env.NODE_DEBUG || process.env.NODE_OPTIONS)).toBe(false);

  const session = await startLiveSession(process.env.GOOGLE_IMAGE_SMOKE_API_KEY!);
  // Unmanaged context: no Playwright page fixture tracing or screenshot hooks.
  let context: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  try {
    context = await browser.newContext({ baseURL: 'http://127.0.0.1:4176' });
    const page = await context.newPage();
    await page.route('**/api/gemini/**', async route => {
      const request = route.request();
      const endpoint = new URL(request.url()).pathname.split('/').at(-1)!;
      if (!['connect', 'interactions', 'session'].includes(endpoint)) {
        await route.fulfill({ status: 400, json: { error: 'Unexpected live test operation.' } });
        return;
      }
      try {
        const result = await session.forward(endpoint, request.headers()['x-gemini-tab'],
          request.postData() ? request.postDataJSON() : undefined);
        await route.fulfill({ status: result.status, contentType: 'application/json', body: result.body });
      } catch {
        // Never expose a native fetch/SDK exception (which can carry headers).
        await route.fulfill({ status: 502, json: { error: 'Live bridge request failed.' } });
      }
    });
    await page.goto('/');
    const result = await page.evaluate(async () => {
      try {
        const connectionPath = '/services/geminiConnection.ts';
        const panelPath = '/services/geminiImageInteractions.ts';
        const { connectGeminiKey, disconnectGeminiKey } = await import(connectionPath);
        const { generatePanelInteraction } = await import(panelPath);
        // Placeholder is replaced in Node only, never with a browser secret.
        await connectGeminiKey('live-test-node-session');
        const isPng = async (data: string) => {
          const bytes = atob(data);
          const signature = [137, 80, 78, 71, 13, 10, 26, 10];
          if (!signature.every((byte, i) => bytes.charCodeAt(i) === byte)) return false;
          const image = new Image();
          image.src = `data:image/png;base64,${data}`;
          await image.decode();
          return image.naturalWidth > 0 && image.naturalHeight > 0;
        };
        try {
          const panel = await generatePanelInteraction(
            'Draw one cheerful cartoon banana at a blue desk, plain white background, no text.',
            [], 'gemini-nano-banana-2.1', '1:1');
          if (!await isPng(panel)) return { generatedPng: false, refinedPng: false, ok: false };
          const refined = await generatePanelInteraction(
            'Edit this same cartoon panel: change the blue desk to red. Keep the banana and composition.',
            [], 'gemini-nano-banana-2.1', '1:1', panel);
          return { generatedPng: true, refinedPng: await isPng(refined), ok: true };
        } finally {
          await disconnectGeminiKey();
        }
      } catch {
        // Only booleans cross into test results, never keys/images/raw errors.
        return { generatedPng: false, refinedPng: false, ok: false };
      }
    });
    expect(result, 'Real Google generation/refinement must complete; check billing, access and current API compatibility if false.').toEqual({
      generatedPng: true, refinedPng: true, ok: true,
    });
    expect(session.calls).toBe(2);
    expect(session.checks).toEqual([
      { correctFormat: true, correctInput: true, completed: true, validBytes: true },
      { correctFormat: true, correctInput: true, completed: true, validBytes: true },
    ]);
  } finally {
    try { await context?.close(); }
    finally { await session.close(); }
  }
});
