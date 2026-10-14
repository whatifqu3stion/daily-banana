import { expect, test } from '@playwright/test';

for (const width of [1440, 402]) {
  test(`warnings are prominent, readable and actionable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Generate Comic Plan' }).click();

    const missingKey = page.getByRole('alert').filter({ has: page.locator('#missing-api-key-message') });
    await expect(missingKey).toBeVisible();
    await expect(missingKey.locator('svg[aria-hidden="true"]')).toHaveCount(1);
    await expect(missingKey.getByRole('button', { name: 'Open API settings' })).toBeVisible();
    expect(await missingKey.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(false);
    await missingKey.getByRole('button', { name: 'Open API settings' }).click();
    await expect(page.getByRole('dialog', { name: 'API settings' })).toBeVisible();
    await page.getByRole('button', { name: 'Close API settings' }).click();

    await page.locator('#comedicStyle').click();
    await page.getByRole('option', { name: 'Dark Comedy' }).click();
    const contentLimits = page.getByRole('note').filter({ hasText: 'Topics involving violence or tragedy may be blocked' });
    await expect(contentLimits).toBeVisible();
    await expect(contentLimits.getByText('Content limits')).toBeVisible();
    await expect(contentLimits.locator('svg[aria-hidden="true"]')).toHaveCount(1);
    expect(await contentLimits.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(false);
    expect(await contentLimits.locator('p').last().evaluate(element => getComputedStyle(element).fontSize)).toBe('16px');
    await page.locator('#comedicStyle').click();
    await page.getByRole('option', { name: 'Satirical' }).click();
    await expect(contentLimits).toHaveCount(0);
  });
}
