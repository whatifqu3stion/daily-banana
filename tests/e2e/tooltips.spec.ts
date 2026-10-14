import { expect, test } from '@playwright/test';

for (const width of [1440, 402]) {
  test(`optional-detail tooltips are isolated to the hovered item at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    const summary = page.locator('summary').filter({ hasText: 'Optional details' });
    await summary.click();
    const visibleHelp = page.locator('[role="tooltip"]:visible');
    await summary.hover();
    await expect(visibleHelp).toHaveCount(0);

    const details = summary.locator('..');
    const tooltips = details.getByRole('tooltip', { includeHidden: true });
    expect(await tooltips.count()).toBeGreaterThan(1);
    for (let index = 0; index < await tooltips.count(); index++) {
      const help = tooltips.nth(index);
      const trigger = help.locator('..').locator(':scope > :first-child');
      await trigger.hover();
      await expect(visibleHelp).toHaveCount(1);
      await expect(help).toBeVisible();
    }

    await summary.hover();
    await expect(visibleHelp).toHaveCount(0);
    await summary.click();
    await expect(visibleHelp).toHaveCount(0);
  });
}
