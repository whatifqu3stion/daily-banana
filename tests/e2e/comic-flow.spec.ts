import { expect, test, type Page } from '@playwright/test';

async function startComic(page: Page) {
  await page.goto('/');
  await page.getByLabel('Topic').fill('Office automation gone wrong');
  await page.getByRole('button', { name: 'Generate Comic Plan' }).click();
  await expect(page.getByRole('heading', { name: 'Choose Your Story' })).toBeVisible();
}

async function reachReview(page: Page) {
  await startComic(page);
  await page.getByRole('button', { name: 'Choose This Story' }).click();
  await expect(page.getByRole('heading', { name: 'Review the first panel' })).toBeVisible();
}

async function reachStrip(page: Page) {
  await reachReview(page);
  await page.getByRole('button', { name: 'Finish the strip' }).click();
  await expect(page.getByRole('heading', { name: 'The Peel Deal' })).toBeVisible();
  await expect(page.getByText('Final edition')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

test('covers setup, story selection, proof review, and final comic', async ({ page }) => {
  await reachStrip(page);
  await expect(page.getByLabel('Current stage: 04 · Make the edition')).toBeVisible();
  await expect(page.getByLabel('Panel 1', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Panel 2', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download' })).toBeEnabled();
});

test('custom selects support arrow keys, Escape, and focus restoration', async ({ page }) => {
  await page.goto('/');
  const stance = page.getByRole('button', { name: 'Stance' });
  await stance.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Neutral' })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('button', { name: 'Critical', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toBeHidden();
  await expect(stance).toBeFocused();

  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: 'Neutral' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(stance).toHaveText(/Neutral/);
  await expect(stance).toBeFocused();
});

test('confirmation modal traps focus, closes on Escape, and restores the trigger', async ({ page }) => {
  await reachReview(page);
  const trigger = page.getByRole('button', { name: 'New comic' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Start a new comic?' });
  await expect(dialog).toBeVisible();
  const cancel = dialog.getByRole('button', { name: 'Keep editing' });
  const confirm = dialog.getByRole('button', { name: 'Discard and start new' });
  await expect(cancel).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  await expect(confirm).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('new-comic actions require confirmation once generation has begun', async ({ page }) => {
  await reachStrip(page);
  await page.getByRole('button', { name: 'Create New' }).click();
  const dialog = page.getByRole('dialog', { name: 'Start a new comic?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByText('Final edition')).toBeVisible();

  await page.getByRole('button', { name: 'New comic' }).click();
  await dialog.getByRole('button', { name: 'Discard and start new' }).click();
  await expect(page.getByRole('button', { name: 'Generate Comic Plan' })).toBeVisible();
});

test('narrow screens keep panel controls below artwork and final actions usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await reachStrip(page);

  const artwork = page.getByTestId('panel-artwork-1');
  const controls = page.getByTestId('panel-mobile-controls-1');
  const artBox = await artwork.boundingBox();
  const controlsBox = await controls.boundingBox();
  expect(artBox).not.toBeNull();
  expect(controlsBox).not.toBeNull();
  expect(controlsBox!.y).toBeGreaterThanOrEqual(artBox!.y + artBox!.height - 1);

  await expect(controls.getByRole('button', { name: 'Refine' })).toBeVisible();
  await expect(controls.getByRole('button', { name: 'Regenerate' })).toBeVisible();
  for (const name of ['Create New', 'New Story', 'Download', 'Share on Twitter']) {
    await expect(page.getByRole('button', { name })).toBeVisible();
  }
});