import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.route('https://generativelanguage.googleapis.com/**', route => route.abort());
  await page.route('**/api/gemini/**', route => route.request().url().endsWith('/connect')
    ? route.fulfill({ json: { connected: true, expiresAt: Date.now() + 1_800_000 } })
    : route.abort());
});

async function reachChoices(page: Page, brainstorm = false) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Generate Comic Plan' }).click();
  await page.getByRole('button', { name: 'Open API settings', exact: true }).click();
  await page.getByLabel('Google API key', { exact: true }).fill('offline-stage-two-test');
  await page.getByRole('button', { name: 'Connect key', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Topic', { exact: true }).fill('Office automation gone wrong');
  if (brainstorm) {
    await page.getByText('Optional details', { exact: true }).click();
    await page.locator('#brainstormMode').check();
  }
  await page.getByRole('button', { name: 'Generate Comic Plan' }).click();
  await expect(page.getByLabel('Current stage: 02 · Choose the angle')).toBeVisible();
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const width of [402, 1440]) {
  test(`stage 02 stays readable, keyboard accessible and consistent with setup at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await reachChoices(page);
    const primary = page.getByRole('button', { name: 'Choose This Story', exact: true });
    await expect(primary).toBeEnabled();
    expect(await primary.evaluate(element => getComputedStyle(element).borderBottomWidth)).toBe('8px');
    await expect(page.getByRole('heading', { name: 'Panel outline', exact: true })).toBeVisible();
    await expectNoOverflow(page);
    await page.screenshot({ path: `/tmp/stage-two-generated-${width}.png`, fullPage: true });

    await page.getByRole('tab', { name: 'Generated story', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    const customTab = page.getByRole('tab', { name: 'Write my own', exact: true });
    await expect(customTab).toBeFocused();
    await expect(customTab).toHaveAttribute('aria-selected', 'true');
    const customButton = page.getByRole('button', { name: 'Generate from My Idea', exact: true });
    await expect(customButton).toBeDisabled();
    await page.getByLabel('Your story premise', { exact: true }).fill('A reporter automates the office and only creates more meetings.');
    await expect(customButton).toBeEnabled();
    expect(await customButton.evaluate(element => getComputedStyle(element).borderBottomWidth)).toBe('8px');
    await expectNoOverflow(page);
    await page.screenshot({ path: `/tmp/stage-two-custom-${width}.png`, fullPage: true });
    await page.keyboard.press('ArrowLeft'); // textarea must not steal tablist navigation.
    await expect(customTab).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: 'Generated story', exact: true }).click();
    await primary.click();
    await expect(page.getByRole('heading', { name: 'Review the first panel', exact: true })).toBeVisible();
  });
}

test('brainstorm tabs wrap with the keyboard and preserve the setup on return', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1000 });
  await reachChoices(page, true);
  await expect(page.getByRole('tab')).toHaveCount(4);
  const first = page.getByRole('tab', { name: 'Story 1', exact: true });
  await first.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'Write my own', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(first).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Story 2', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'New Ideas', exact: true })).toBeVisible();
  await expectNoOverflow(page);
  await page.screenshot({ path: '/tmp/stage-two-brainstorm-768.png', fullPage: true });
  await page.getByRole('button', { name: 'Back to topic and style', exact: true }).click();
  await expect(page.getByLabel('Topic', { exact: true })).toHaveValue('Office automation gone wrong');
});

test('custom-angle warnings and loading remain accessible without losing the draft', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 1000 });
  await page.goto('/');
  await page.evaluate(async () => {
    const reactPath = '/node_modules/.vite/deps/react.js', clientPath = '/node_modules/.vite/deps/react-dom_client.js';
    const componentPath = '/components/StorySwiper.tsx';
    const reactModule = await import(reactPath), client = await import(clientPath);
    const React = reactModule.default || reactModule;
    const { default: StorySwiper } = await import(componentPath);
    const createRoot = client.createRoot || client.default.createRoot;
    const host = document.createElement('main'); host.style.padding = '16px';
    document.getElementById('root')?.remove(); document.body.append(host);
    const w = window as any;
    createRoot(host).render(React.createElement(() => {
      const [loading, setLoading] = React.useState(false);
      const [error, setError] = React.useState(null);
      w.customStage = { setLoading, setError };
      return React.createElement(StorySwiper, {
        storyPlans: [], onSelectStory: () => {}, onRegenerate: () => {}, onReturnToForm: () => {},
        onCustomPremise: () => setLoading(true), isCustomPremiseLoading: loading, customPremiseError: error,
      });
    }));
  });
  const draft = page.getByLabel('Your story premise', { exact: true });
  await draft.fill('A very serious newsroom is run entirely by bananas.');
  await page.getByRole('button', { name: 'Generate from My Idea', exact: true }).click();
  await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-busy', 'true');
  await expect(draft).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('Building your custom story plan');
  await page.evaluate(() => {
    const w = window as any;
    w.customStage.setLoading(false);
    w.customStage.setError('The story service could not complete this request.');
  });
  await expect(page.getByRole('alert')).toContainText('Adjust your premise above and try again.');
  expect(await page.getByRole('alert').evaluate(element => getComputedStyle(element).color)).toBe('rgb(0, 0, 0)');
  await expect(draft).toHaveValue('A very serious newsroom is run entirely by bananas.');
  await expect(page.getByRole('button', { name: 'Generate from My Idea', exact: true })).toBeEnabled();
  await expectNoOverflow(page);
});
